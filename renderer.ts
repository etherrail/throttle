import { Layout, Section } from "@packtrack/layout";
import sdl from '@kmamal/sdl';
import { Canvas, CanvasRenderingContext2D, Path2D } from "skia-canvas";

export class Renderer {
	readonly maximumFramerate = 60;

	sectionPaths = new Map<Section, Path2D>();
	private window: sdl.Window;
	private canvas: Canvas;
	private context: CanvasRenderingContext2D;

	private frameIndex = 0;

	constructor(
		private width: number,
		private height: number,
		private layout: Layout,
		private loop: (width: number, height: number, context: CanvasRenderingContext2D) => void
	) {}

	start() {
		this.window = sdl.video.createWindow({
			title: 'PackTrack throttle',

			width: this.width,
			height: this.height,

			resizable: true,
		});

		this.setupCanvas();

		this.window.on('resize', event => this.resize(event.width, event.height));

		this.window.on('close', () => {
			this.window = null;

			console.log('EXIT');
			process.kill(process.pid, 'SIGKILL');
		});

		// start frame loop
		this.frame();
	}

	stop() {
		this.window?.destroy();
		this.window = null;
	}

	private setupCanvas() {
		this.canvas = new Canvas(this.width, this.height);
		this.context = this.canvas.getContext('2d');

		this.resize(this.width, this.height);
	}

	private async frame() {
		if (!this.window) {
			return;
		}

		// reset the canvas every 100 frames
		//
		// the canvas slowly gets slower each time it is exported as a buffer
		// resetting it makes it stay fast
		if (this.frameIndex++ == 100) {
			this.frameIndex = 0;

			this.setupCanvas();
		}

		const start = +new Date();

		// clear old frame
		this.context.fillStyle = '#000';
		this.context.fillRect(0, 0, this.width, this.height);

		// get new frame
		this.loop(this.width, this.height, this.context);

		// write canvas to window
		// undocumented option raw outputs pixel data in rgba32
		const buffer = this.canvas.toBufferSync('raw');
		this.window.render(this.width, this.height, this.width * 4, 'rgba32', buffer);

		const end = +new Date();
		const frameTime = end - start;

		const targetFrametime = 1000 / this.maximumFramerate;
		setTimeout(() => this.frame(), Math.max(targetFrametime - frameTime, 1));
	}

	resize(width: number, height: number) {
		if (!this.window) {
			return;
		}

		this.width = this.canvas.width = width;
		this.height = this.canvas.height = height;
	}
}
