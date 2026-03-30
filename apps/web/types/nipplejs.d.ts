declare module 'nipplejs' {
  export type EventData = {
    identifier?: number;
  };

  export type JoystickOutputData = {
    force?: number;
    vector?: {
      x?: number;
      y?: number;
    };
  };

  export type Options = {
    zone: HTMLElement;
    mode?: 'dynamic' | 'static' | 'semi';
    position?: {
      left: string;
      top: string;
    };
    color?: string;
    size?: number;
    multitouch?: boolean;
    maxNumberOfNipples?: number;
    dynamicPage?: boolean;
    restOpacity?: number;
    fadeTime?: number;
  };

  export type JoystickManager = {
    on(eventName: string, callback: (eventData: unknown, outputData?: unknown) => void): void;
    off(eventName: string, callback: (eventData: unknown, outputData?: unknown) => void): void;
    destroy(): void;
  };

  export function create(options: Options): JoystickManager;

  const nipplejs: {
    create: typeof create;
  };

  export default nipplejs;
}
