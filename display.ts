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

	context: CanvasRenderingContext2D;

	width: number;
	columnWidth: number;

	height: number;
	rowHeight: number;

	activeTrain: Train;

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

		// draw location
		this.context.textAlign = 'left';
		this.context.textBaseline = 'top';
		this.context.font = `${this.baseFontSize}px monospace`;
		this.context.fillText(this.activeTrain.lastPositioner.location.section.name, this.columnWidth + this.margin.x, y + this.margin.y);

		// draw positioner timeout
		this.context.textBaseline = 'bottom';
		this.context.fillText(`${+new Date() - +this.activeTrain.lastPositioner.time}ms`, this.columnWidth + this.margin.x, y + height - this.margin.y);

		// trail
		let x = this.columnWidth;
		let tip = this.activeTrain.head.nominal.section;
		const step = this.width / 5;

		while (tip && x < this.width - this.columnWidth * 2) {
			const router = tip.out;

			if (router instanceof Router) {
				this.context.textBaseline = 'bottom';
				this.context.fillText(router.name, x + this.margin.x, y + height / 2 - this.margin.y);

				this.context.textBaseline = 'top';
				this.context.fillText(router.activeRoute.name, x + this.margin.x, y + height / 2 + this.margin.y);

				x += step;
			}

			tip = tip.next(this.activeTrain.reversed);
		}

		this.context.lineWidth = 10;
		this.context.beginPath();
		this.context.moveTo(this.columnWidth, y + height / 2);
		this.context.lineTo(this.width - this.columnWidth, y + height / 2);
		this.context.stroke();
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
