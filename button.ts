import { ThrottleButtonLightMessage } from '@packtrack/protocol';

export class Button {
	static buttons: Button[] = [];
	static update = (message: ThrottleButtonLightMessage) => {};

	down = false;
	lit = false;

	press: () => void;

	constructor(
		public channel: string
	) {
		Button.buttons.push(this);
	}

	light() {
		if (this.lit) {
			return;
		}

		this.lit = true;
		Button.update(new ThrottleButtonLightMessage(this.channel, 1));
	}

	dark() {
		if (!this.lit) {
			return;
		}

		this.lit = false;
		Button.update(new ThrottleButtonLightMessage(this.channel, 0));
	}
}

// speed indicator buttons (on analog pins)
export const speedIndicatorButton1 = new Button('');
export const speedIndicatorButton2 = new Button('');
export const speedIndicatorButton3 = new Button('');
export const speedIndicatorButton4 = new Button('');
export const speedIndicatorButton5 = new Button('');
export const speedIndicatorButton6 = new Button('');

// unit button (buttons below screen)
export const unitActionButtons = [
	new Button('railcar-1'),
	new Button('railcar-2'),
	new Button('railcar-3'),
	new Button('railcar-4'),
	new Button('railcar-5'),
	new Button('railcar-6'),
	new Button('railcar-7'),
	new Button('railcar-8'),
	new Button('railcar-9')
];

// left buttons
export const leftButton1 = new Button('previous-train');

export const pilotbutton = new Button('pilot');
export const leftButton3 = new Button('');
export const leftButton4 = new Button('');
export const leftButton5 = new Button('');

export const railcarPreviousButton = new Button('railcar-previous');
export const railcarFirstButton = new Button('railcar-first');

// right buttons
export const nextTrainButton = new Button('next-train');

export const routeUpButton = new Button('route-up');
export const routeDownButton = new Button('route-down');
export const routeLockButton = new Button('route-lock');
export const routeReleaseButton = new Button('route-release');

export const railcarNextButton = new Button('railcar-next');
export const railcarLastButton = new Button('railcar-last');

export const pilotButton = new Button('pilot');

export const previousTrainButton = new Button('previous-train');
