import { Layout, SectionPosition } from '@packtrack/layout';
import { Message, findMessageType, MonitorRouteMessage, TypedMessage, MonitorTrainPositionMessage, MonitorTrainSpeedPermitMessage, ThrottleButtonLightMessage, ThrottleTachometerMessage, ThrottleButtonPressMessage } from '@packtrack/protocol';
import { MeasuredPosition, Train, TrainIndex } from '@packtrack/train'
import { readFileSync } from 'fs';
import { DOMParser } from "xmldom";
import { Renderer } from './renderer';
import { Socket } from 'net';
import { Discovery } from './discovery';
import { Display } from './display';
import { SerialPort } from './serial';
import { Button, nextTrainButton, pilotButton, previousTrainButton } from './button';

const layoutFileLocation = process.env.LAYOUT_FILE_LOCATION;
const layout = Layout.from(new DOMParser().parseFromString(readFileSync(layoutFileLocation).toString(), "text/xml"));

const trainIndexFileLocation = process.env.TRAIN_INDEX_FILE_LOCATION;
const trainIndex = TrainIndex.from(new DOMParser().parseFromString(readFileSync(trainIndexFileLocation).toString(), "text/xml"), layout);

const connection = new Socket();

const start = () => {
	const discovery = new Discovery('throttle-master');

	discovery.find().then(director => {
		connection.connect(141, director, () => {
			serial.attach().then(() => {
				renderer.start();
			});
		});

		const router = new Map<TypedMessage, (message: Message) => void>();

		router.set(MonitorRouteMessage, message => {
			for (let district of layout.allDistricts) {
				for (let router of district.routers) {
					if (router.domainName == message.headers.router) {
						router.activeRoute = router.routes.find(route => route.name == message.headers['active-route']);

						console.log('-- router', router.name, 'routes', router.activeRoute?.name);
					}
				}
			}
		});

		router.set(MonitorTrainSpeedPermitMessage, message => {
			const train = trainIndex.trains.find(train => train.name == message.headers.train);
			train.permit(+message.headers['speed'], new Date(message.headers['issued'] as string));

			serial.send(new ThrottleTachometerMessage(Math.floor(train.currentSpeedPermit.speed * 3.6)));
		});

		router.set(MonitorTrainPositionMessage, message => {
			const train = trainIndex.trains.find(train => train.name == message.headers.train);

			let position;

			for (let district of layout.allDistricts) {
				for (let section of district.sections) {
					if (section.domainName == message.headers['position-section']) {
						position = new SectionPosition(
							section,
							+message.headers['position-offset'],
							false
						)
					}
				}
			}

			train.lastPositioner = new MeasuredPosition(
				new Date(+message.headers['position-time']),
				position,
				train.reversed,
				0
			);

			console.log(train.name, train.lastPositioner.location.toString());
		});

		let buffer = Buffer.from([]);

		connection.on('data', data => buffer = Message.dispatch(buffer, data, message => {
			const type = findMessageType(message);
			router.get(type)(message);
		}));

		connection.on('close', () => {
			renderer.stop();

			setTimeout(() => start(), 1000);
		});
	});
};

let activeTrain = trainIndex.trains[0];
const display = new Display(layout, trainIndex);

previousTrainButton.press = () => activeTrain = trainIndex.trains[trainIndex.trains.indexOf(activeTrain) - 1] ?? trainIndex.trains.at(-1);
nextTrainButton.press = () => activeTrain = trainIndex.trains[trainIndex.trains.indexOf(activeTrain) + 1] ?? trainIndex.trains[0];

const renderer = new Renderer(1366, 768, layout, (width, height, context) => {
	display.render(width, height, context, activeTrain);
});

Button.update = message => serial.send(message);

const serial = new SerialPort('/dev/cu.usbserial-420', message => {
	pilotButton.light();

	const router = new Map<TypedMessage, (message: Message) => void>();

	router.set(ThrottleButtonPressMessage, message => {
		const button = Button.buttons.find(button => button.channel == message.headers.channel);
		console.log('**', button.channel);

		if (button?.press) {
			button.press();
		}
	});

	const type = findMessageType(message);
	router.get(type)(message);
});

start();
