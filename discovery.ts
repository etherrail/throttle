import { createSocket, Socket } from 'dgram';
import { LoginMessage, ConnectMessage, findMessageType, Message } from '@packtrack/protocol';

export class Discovery {
	readonly requestPort = 142;

	private socket: Socket;
	private responseTimeout = setTimeout(() => { });

	constructor(
		private device: string
	) {}

	sendDiscoveryRequest() {
		const message = new LoginMessage(this.device).toBuffer();

		this.socket.setBroadcast(true);

		this.socket.send(message, 0, message.length, this.requestPort, '255.255.255.255', error => {
			if (error) {
				console.error('discovery request send failed', error);

				setTimeout(() => this.sendDiscoveryRequest(), 1000);
				return;
			}

			clearTimeout(this.responseTimeout);
			this.responseTimeout = setTimeout(() => {
				this.sendDiscoveryRequest();
			}, 5000);

			console.error('request sent');
		});
	}

	find() {
		console.log('request discovery...');

		return new Promise<string>(done => {
			this.socket = createSocket('udp4');

			this.socket.on('message', (data, remote) => {
				console.log(`response from ${remote.address}:${remote.port}`);

				const message = Message.from(data);

				if (!message) {
					console.warn('invalid invitaiton');

					return this.sendDiscoveryRequest();
				}

				if (findMessageType(message) != ConnectMessage) {
					console.warn('invalid invitaiton type');

					return this.sendDiscoveryRequest();
				}

				if (message.headers.version != '1') {
					console.warn('invalid invitaiton version');

					return this.sendDiscoveryRequest();
				}

				clearTimeout(this.responseTimeout);
				this.socket.close();

				done(remote.address);
			});

			this.socket.bind(() => {
				this.sendDiscoveryRequest();
			});
		});
	}
}
