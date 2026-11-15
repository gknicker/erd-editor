import { css } from '@dineug/r-html';

import { SASH_SIZE } from '@/constants/layout';

export const sash = css`
  position: absolute;

  &.vertical {
    width: ${SASH_SIZE}px;
    height: 100%;
    cursor: ew-resize;
  }

  &.horizontal {
    width: 100%;
    height: ${SASH_SIZE}px;
    cursor: ns-resize;
  }

  &.edge {
    width: ${SASH_SIZE}px;
    height: ${SASH_SIZE}px;
  }
`;
