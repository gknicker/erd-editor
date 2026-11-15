/** The part of @easylogic/colorpicker the editor uses; it ships no declarations. */
declare module '@easylogic/colorpicker' {
  export type ColorPickerInstance = {
    destroy: () => void;
    $root: { el: HTMLElement };
  };

  export type ColorPickerOptions = {
    container: HTMLElement;
    type: 'sketch';
    position: 'inline';
    color: string;
    onChange: (color: string) => void;
    onLastUpdate: (color: string) => void;
  };

  const ColorPickerUI: {
    create: (options: ColorPickerOptions) => ColorPickerInstance;
  };

  export default ColorPickerUI;
}
