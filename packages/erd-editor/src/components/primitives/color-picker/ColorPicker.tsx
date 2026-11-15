import { createRef, FC, observable, onMounted, ref } from '@dineug/r-html';
import type {
  ColorPickerInstance,
  default as ColorPickerUI,
} from '@easylogic/colorpicker';

import { Viewport } from '@/engine/modules/editor/state';
import { useUnmounted } from '@/hooks/useUnmounted';

import * as styles from './ColorPicker.styles';

let library: Promise<typeof ColorPickerUI> | null = null;

/**
 * The picker library, loaded the first time a picker opens: the largest
 * dependency the page carries, for a control most sessions never show. A load
 * that fails is not kept, so the next picker asks again.
 */
function loadColorPickerUI(): Promise<typeof ColorPickerUI> {
  library ??= import('@easylogic/colorpicker').then(
    module => module.default,
    error => {
      library = null;
      throw error;
    }
  );

  return library;
}

export type ColorPickerProps = {
  x: number;
  y: number;
  color: string;
  viewport?: Viewport | null;
  onChange?: (color: string) => void;
  onLastUpdate?: (color: string) => void;
};

const ColorPicker: FC<ColorPickerProps> = (props, ctx) => {
  const container = createRef<HTMLDivElement>();
  const { addUnsubscribe } = useUnmounted();
  const state = observable({
    x: props.x,
    y: props.y,
  });

  onMounted(() => {
    const $container = container.value;
    let colorPicker: ColorPickerInstance | null = null;
    let unmounted = false;

    // Registered before the library arrives, so a picker closed while it
    // loads is never created.
    addUnsubscribe(() => {
      unmounted = true;
      if (!colorPicker) return;
      colorPicker.destroy();
      $container.removeChild(colorPicker.$root.el);
    });

    loadColorPickerUI().then(
      ColorPickerUI => {
        if (unmounted) return;
        colorPicker = ColorPickerUI.create({
          container: $container,
          type: 'sketch',
          position: 'inline',
          color: props.color || '',
          onChange: (color: string) => {
            props.onChange?.(color);
          },
          onLastUpdate: (color: string) => {
            props.onLastUpdate?.(color);
          },
        });
        fitViewport($container);
      },
      error => {
        console.warn('[color-picker] the picker could not be loaded', error);
      }
    );
  });

  /** Moves the picker back inside the viewport, once it has a size to fit. */
  const fitViewport = ($container: HTMLDivElement) => {
    if (props.viewport) {
      const rect = $container.getBoundingClientRect();
      const width = props.x + rect.width;
      const height = props.y + rect.height;

      if (props.viewport.width < width) {
        const x = props.viewport.width - rect.width;
        if (0 <= x) {
          state.x = x;
        }
      }
      if (props.viewport.height < height) {
        const y = props.viewport.height - rect.height;
        if (0 <= y) {
          state.y = y;
        }
      }
    }
  };

  return () => (
    <div
      class={['color-picker', styles.container]}
      style={{
        top: `${state.y}px`,
        left: `${state.x}px`,
      }}
      use:ref={ref(container)}
    ></div>
  );
};

export default ColorPicker;
