import { close, createReadStream, existsSync, open, read, write } from "fs";
import { Message, LoginMessage } from "@packtrack/protocol";
import { SerialPort as NativePort } from "serialport";
import { Device } from "@packtrack/layout";

export class SerialPort {
	private static ports: SerialPort[] = [];

	private handle: NativePort;

	device: Device;

	private messageQueue: Buffer[] = [];

	private messageBuffer = Buffer.from([]);

	constructor(
		private port: string,
		private handleMessage: (message: Message) => void
	) {}

	async attach() {
		this.handle = new NativePort({
			path: this.port,
			baudRate: 9600,
			autoOpen: false
		});

		SerialPort.ports.push(this);

		this.handle.on('data', data => {
			console.log('*', data.toString());

			this.messageBuffer = Message.dispatch(this.messageBuffer, data, message => {
				if (message.routes(...LoginMessage.route)) {
					this.device = new Device(message.headers.device);

					// the processor needs quite some time to process the messages
					setInterval(() => {
						const message = this.messageQueue.shift();

						if (message) {
							this.handle.write(message);
						}
					}, 100);

					return;
				}

				this.handleMessage(message);
			});
		});

		this.handle.on('error', error => {
			console.log('cannot open handle', error);
		});

		await new Promise<void>((done, fail) => this.handle.open(error => {
			if (error) {
				return fail(error);
			}

			console.log(`attached to '${this.port}'`);
			done();
		}));
	}

	send(message: Message) {
		this.messageQueue.push(message.toBuffer());
	}
}
