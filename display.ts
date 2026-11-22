import { CanvasRenderingContext2D } from "skia-canvas";
import { Layout, PointPositioner, Route, Router, Section, SectionPosition } from '@packtrack/layout';
import { MeasuredPosition, Train, TrainIndex } from '@packtrack/train';
import { Railcar } from "@packtrack/train/source/railcar";
import { Traction } from "@packtrack/train/source/railcar/traction";
import { Button, unitActionButtons } from "./button";

export class Display {
	readonly trainRows = 1;
	readonly routeRows = 4;
	readonly railcarsRows = 2;
	readonly rows = this.trainRows + this.routeRows + this.railcarsRows;

	readonly columns = 9;

	readonly textColor = '#fff';
	readonly backgroundColor = '#000';
	readonly branchColor = '#888';
	readonly cursorColor = '#333';

	// sections or routers shown on a branch before it is cut off
	readonly branchLookahead = 2;

	context: CanvasRenderingContext2D;

	width: number;
	columnWidth: number;

	height: number;
	rowHeight: number;

	activeTrain: Train;

	// first router ahead of the train with a choice, which is not locked by this throttle
	cursor: { router: Router, routes: Route[] };
	selectedRoute: Route;

	// routers locked by this throttle, in order along the trail
	trainLocks = new Map<Train, { router: Router, route: Route }[]>();

	baseFontSize: number;
	margin: { x: number, y: number };

	constructor(
		private layout: Layout,
		private trainIndex: TrainIndex
	) {}

	render(width: number, height: number, context: CanvasRenderingContext2D, activeTrain: Train) {
		this.width = width;
		this.columnWidth = width / this.columns;

		this.height = height;
		this.rowHeight = height / this.rows;

		this.context = context;
		this.activeTrain = activeTrain;

		this.baseFontSize = this.rowHeight / 6;

		this.margin = {
			x: this.baseFontSize,
			y: this.baseFontSize
		};

		this.context.strokeStyle = this.textColor;
		this.context.fillStyle = this.textColor;

		this.renderMainSectionSeparators();
		this.renderTrainSection();
		this.renderRouteSection();
		this.renderRailcarSection();
	}

	renderMainSectionSeparators() {
		this.context.beginPath();
		this.context.moveTo(0, this.rowHeight * this.trainRows);
		this.context.lineTo(this.width, this.rowHeight * this.trainRows);
		this.context.moveTo(0, this.rowHeight * (this.trainRows + this.routeRows));
		this.context.lineTo(this.width, this.rowHeight * (this.trainRows + this.routeRows));

		this.context.lineWidth = 3;
		this.context.stroke();
	}

	renderTrainSection() {
		const index = this.trainIndex.trains.indexOf(this.activeTrain);

		const previous = this.trainIndex.trains[index - 1] ?? this.trainIndex.trains[this.trainIndex.trains.length - 1];
		const next = this.trainIndex.trains[index + 1] ?? this.trainIndex.trains[0];

		// draw previous / next separators
		this.context.beginPath();
		this.context.moveTo(this.columnWidth, 0);
		this.context.lineTo(this.columnWidth, this.rowHeight);

		this.context.moveTo(this.width - this.columnWidth, 0);
		this.context.lineTo(this.width - this.columnWidth, this.rowHeight);

		this.context.lineWidth = 1;
		this.context.stroke();

		// draw previous / next tiles
		this.renderAdjacentTrain(previous, 0);
		this.renderAdjacentTrain(previous, this.width - this.columnWidth);

		// render tagline
		this.context.textAlign = 'left';
		this.context.textBaseline = 'top';
		this.context.font = `${this.baseFontSize}px monospace`;
		this.context.fillText([
			`${index + 1}/${this.trainIndex.trains.length}`,

			// speed permit
			`${+new Date() - +this.activeTrain.currentSpeedPermit.issued}ms`
		].join(' '), this.columnWidth + this.margin.x, this.margin.y);

		// render name
		this.context.textBaseline = 'bottom';
		this.context.font = `${this.baseFontSize * 2}px monospace`;
		this.context.fillText(this.activeTrain.name, this.columnWidth + this.margin.x, this.rowHeight - this.margin.y);
	}

	renderAdjacentTrain(train: Train, x: number) {
		this.context.fillStyle = '#fff';

		// draw name
		this.context.textAlign = 'center';
		this.context.textBaseline = 'middle';
		this.context.font = `${this.baseFontSize}px monospace`;
		this.context.fillText(train.name, x + this.columnWidth / 2, this.rowHeight / 2);
	}

	renderRouteSection() {
		const y = this.trainRows * this.rowHeight;
		const height = this.routeRows * this.rowHeight;
		const step = this.width / 5;
		const middle = y + height / 2;

		const stops = this.findStops(Math.floor((this.width - this.columnWidth * 2) / step));

		// highlight cursor
		const cursorIndex = stops.findIndex(stop => stop.router == this.cursor?.router);

		if (cursorIndex != -1) {
			this.context.fillStyle = this.cursorColor;
			this.context.fillRect(this.columnWidth + cursorIndex * step, y, step, height);
			this.context.fillStyle = this.textColor;
		}

		// draw location
		this.context.textAlign = 'left';
		this.context.textBaseline = 'top';
		this.context.font = `${this.baseFontSize}px monospace`;
		this.context.fillText(this.activeTrain.lastPositioner.location.section.name, this.columnWidth + this.margin.x, y + this.margin.y);

		// draw positioner timeout
		this.context.textBaseline = 'bottom';
		this.context.fillText(`${+new Date() - +this.activeTrain.lastPositioner.time}ms`, this.columnWidth + this.margin.x, y + height - this.margin.y);

		for (let stop of stops) {
			const index = stops.indexOf(stop);
			const x = this.columnWidth + index * step;

			// labels are moved right to stay clear of the branch diagonals
			this.context.textBaseline = 'bottom';
			this.context.fillText(stop.router.name, x + this.margin.x * 2, middle - this.margin.y);

			this.context.textBaseline = 'top';
			this.context.fillText(stop.route?.name ?? '-', x + this.margin.x * 2, middle + this.margin.y);

			// diverging branches leave room for the converging tracks of the next router
			const divergingLimit = Math.min(x + (stops[index + 1]?.converging.length ? step / 2 : step), this.width - this.columnWidth) - this.margin.x;
			const convergingLimit = Math.max(x - step / 2, 0) + this.margin.x;

			for (let route of stop.diverging) {
				this.renderBranch(route, stop.from, x, middle, this.branchY(stop, route, middle, height), divergingLimit);
			}

			for (let route of stop.converging) {
				this.renderConverging(route, stop.to, x, middle, this.branchY(stop, route, middle, height), convergingLimit);
			}
		}

		this.context.lineWidth = 10;
		this.context.beginPath();
		this.context.moveTo(this.columnWidth, middle);
		this.context.lineTo(this.width - this.columnWidth, middle);
		this.context.stroke();
	}

	// follows the trail ahead of the train through the locked routes, the route selected at the cursor and the active routes
	// the first router which is not locked by this throttle becomes the cursor
	findStops(limit: number) {
		const stops: { router: Router, from: Section, route: Route, to: Section, diverging: Route[], converging: Route[] }[] = [];
		const locks = this.locks;

		this.cursor = null;

		let previous: Router | Section;
		let tip = this.activeTrain.head.nominal.section;
		let exit = this.activeTrain.reversed ? tip.in : tip.out;

		while (exit && stops.length < limit) {
			if (exit instanceof Section) {
				previous = tip;
				tip = exit;
			} else {
				const router = exit;
				let route = locks.find(lock => lock.router == router)?.route;

				// routers without a choice are skipped, unless they are set against the trail
				const routes = this.availableRoutes(router, tip);

				if (!route && !this.cursor && (routes.length > 1 || !routes.includes(router.activeRoute))) {
					this.cursor = { router, routes };

					// selection starts at the routers active route whenever the cursor moves
					if (!this.cursor.routes.includes(this.selectedRoute)) {
						this.selectedRoute = this.cursor.routes.includes(router.activeRoute) ? router.activeRoute : this.cursor.routes[0];
					}

					route = this.selectedRoute;
				}

				route ??= router.activeRoute;

				// the router is not set to lead anywhere from here
				if (route?.in != tip && route?.out != tip) {
					const diverging = this.availableRoutes(router, tip);
					stops.push({ router, from: tip, route: null, to: null, diverging, converging: [] });

					break;
				}

				const to = route.in == tip ? route.out : route.in;

				// routes branching off the trail, and routes joining it from other tracks
				const diverging = this.availableRoutes(router, tip).filter(candidate => candidate != route);
				const converging = this.availableRoutes(router, to).filter(candidate => candidate != route && !diverging.includes(candidate));

				stops.push({ router, from: tip, route, to, diverging, converging });

				previous = router;
				tip = to;
			}

			// continue on the far side, regardless of the orientation of the section
			exit = tip.in == previous ? tip.out : tip.in;
		}

		return stops;
	}

	get locks() {
		if (!this.trainLocks.has(this.activeTrain)) {
			this.trainLocks.set(this.activeTrain, []);
		}

		return this.trainLocks.get(this.activeTrain);
	}

	cycleRoute(offset: number) {
		const routes = this.cursor?.routes;

		if (!routes?.length) {
			return;
		}

		const index = routes.indexOf(this.selectedRoute) + offset;
		this.selectedRoute = routes[(index + routes.length) % routes.length];
	}

	// locks the selected route and advances the cursor to the next router
	//
	// the route is shown as locked right away, the director switches it immediately
	// a lock rejected by the director is not reflected here yet
	lock() {
		if (!this.cursor || !this.selectedRoute) {
			return;
		}

		const route = this.selectedRoute;
		this.locks.push({ router: this.cursor.router, route });

		return route;
	}

	// releases the last lock, which moves the cursor back to its router
	release() {
		return this.locks.pop()?.router;
	}

	// routes leading away from a section through a router
	// facing routers offer multiple routes, trailing routers only lead into one
	availableRoutes(router: Router, from: Section) {
		return router.routes.filter(route => route.in == from || route.out == from);
	}

	// routes are stacked in the order of the router, around the route taken
	// routes before the taken route are placed below the trail, the ones after it above
	// this keeps the routes in place when cycling through them, route-up selects the one above
	branchY(stop: { router: Router, route: Route, diverging: Route[], converging: Route[] }, route: Route, middle: number, height: number) {
		const order = stop.router.routes;
		const taken = order.indexOf(stop.route);
		const index = order.indexOf(route);

		const above = index > taken;
		const shown = [...stop.diverging, ...stop.converging];
		const distance = shown.filter(candidate => (order.indexOf(candidate) > taken) == above && Math.abs(order.indexOf(candidate) - taken) <= Math.abs(index - taken)).length;

		const offset = height * (0.25 + 0.12 * (distance - 1));

		return above ? middle - offset : middle + offset;
	}

	// draws a track joining the trail at the router, with the section it comes from
	renderConverging(route: Route, to: Section, x: number, toY: number, fromY: number, limit: number) {
		const section = route.in == to ? route.out : route.in;
		const labels = [route.name, section.name];

		this.context.save();

		this.context.beginPath();
		this.context.rect(limit, Math.min(fromY, toY) - this.baseFontSize, x - limit, Math.abs(toY - fromY) + this.baseFontSize * 2);
		this.context.clip();

		this.context.strokeStyle = this.branchColor;
		this.context.fillStyle = this.textColor;
		this.context.lineWidth = 4;
		this.context.textAlign = 'right';
		this.context.textBaseline = 'middle';
		this.context.font = `${this.baseFontSize}px monospace`;

		// join the trail
		let cursor = x - Math.abs(toY - fromY) / 2;

		this.context.beginPath();
		this.context.moveTo(x, toY);
		this.context.lineTo(cursor, fromY);

		// labels are laid out backwards, away from the router
		for (let label of labels) {
			const gap = this.baseFontSize;

			this.context.lineTo(cursor - gap, fromY);
			this.context.fillText(label, cursor - gap * 1.5, fromY);

			cursor -= gap * 2 + this.context.measureText(label).width;
			this.context.moveTo(cursor, fromY);
		}

		this.context.lineTo(limit, fromY);

		this.context.stroke();
		this.context.restore();
	}

	renderBranch(route: Route, from: Section, x: number, fromY: number, toY: number, limit: number) {
		const labels = [route.name];

		// follow the branch, regardless of the orientation of the sections on it
		let previous: Router | Section = route.router;
		let next: Router | Section = route.in == from ? route.out : route.in;

		while (next instanceof Section && labels.length <= this.branchLookahead) {
			labels.push(next.name);

			const exit = next.in == previous ? next.out : next.in;
			previous = next;
			next = exit;
		}

		const deadEnd = !next;

		if (next instanceof Router && labels.length <= this.branchLookahead) {
			labels.push(`${next.name} …`);
		} else if (next) {
			labels.push('…');
		}

		this.context.save();

		this.context.beginPath();
		this.context.rect(x, Math.min(fromY, toY) - this.baseFontSize, limit - x, Math.abs(toY - fromY) + this.baseFontSize * 2);
		this.context.clip();

		this.context.strokeStyle = this.branchColor;
		this.context.fillStyle = this.textColor;
		this.context.lineWidth = 4;
		this.context.textAlign = 'left';
		this.context.textBaseline = 'middle';
		this.context.font = `${this.baseFontSize}px monospace`;

		// diverge from the trail
		let cursor = x + Math.abs(toY - fromY) / 2;

		this.context.beginPath();
		this.context.moveTo(x, fromY);
		this.context.lineTo(cursor, toY);

		// section names, joined by track
		for (let label of labels) {
			const gap = this.baseFontSize;

			this.context.lineTo(cursor + gap, toY);
			this.context.fillText(label, cursor + gap * 1.5, toY);

			cursor += gap * 2 + this.context.measureText(label).width;
			this.context.moveTo(cursor, toY);
		}

		if (deadEnd) {
			this.context.moveTo(cursor, toY - this.baseFontSize / 2);
			this.context.lineTo(cursor, toY + this.baseFontSize / 2);
		} else {
			this.context.lineTo(limit, toY);
		}

		this.context.stroke();
		this.context.restore();
	}

	renderRailcarSection() {
		let column = 0;

		for (let railcar of this.activeTrain.railcars) {
			column += this.renderRailcar(railcar, column);
		}
	}

	renderRailcar(railcar: Railcar, column: number) {
		const index = this.activeTrain.railcars.indexOf(railcar);
		const actions: { name: string, active: boolean, handler: () => void }[] = [];

		const x = column * this.columnWidth;
		const span = Math.max(actions.length, 1);
		const width = this.columnWidth * span;

		const y = this.rowHeight * (this.trainRows + this.routeRows);

		// render separator
		this.context.beginPath();
		this.context.moveTo(x + width, y);
		this.context.lineTo(x + width, this.height);

		this.context.lineWidth = 1;
		this.context.stroke();

		// index
		this.context.textAlign = 'left';
		this.context.textBaseline = 'top';
		this.context.font = `${this.baseFontSize}px monospace`;
		this.context.fillText(`${index + 1}`, x + this.margin.x, y + this.margin.y);

		// name
		this.context.font = `${this.baseFontSize}px monospace`;
		this.context.fillText(railcar.name, x + this.margin.x, y + this.margin.y * 2 + this.baseFontSize);

		// render actions
		const actionHeight = this.rowHeight * 0.6;

		this.context.beginPath();

		if (actions.length) {
			this.context.moveTo(x, this.height - actionHeight);
			this.context.lineTo(x + width, this.height - actionHeight);
		}

		this.context.textAlign = 'center';
		this.context.textBaseline = 'middle';
		this.context.font = `${this.baseFontSize}px monospace`;
		this.context.fillStyle = this.textColor;

		for (let action of actions) {
			const index = actions.indexOf(action);
			let xOffset = x + actions.indexOf(action) * this.columnWidth;
			const button = unitActionButtons[column + index];

			this.context.moveTo(xOffset + this.columnWidth, this.height - actionHeight);
			this.context.lineTo(xOffset + this.columnWidth, this.height);

			this.context.fillText(action.name, xOffset + this.columnWidth / 2, this.height - actionHeight / 2);

			if (button) {
				if (action.active) {
					button.light();
				} else {
					button.dark();
				}

				button.press = () => action.handler();
			}
		}

		this.context.stroke();

		return span;
	}
}
