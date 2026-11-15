import { actions as editorActions } from '@/engine/modules/editor/atom.actions';
import { actions$ as editorActions$ } from '@/engine/modules/editor/generator.actions';
import { actions as indexActions } from '@/engine/modules/index/atom.actions';
import { actions$ as indexActions$ } from '@/engine/modules/index/generator.actions';
import { actions as indexColumnActions } from '@/engine/modules/index-column/atom.actions';
import { actions$ as indexColumnActions$ } from '@/engine/modules/index-column/generator.actions';
import { actions as memoActions } from '@/engine/modules/memo/atom.actions';
import { actions$ as memoActions$ } from '@/engine/modules/memo/generator.actions';
import { actions as relationshipActions } from '@/engine/modules/relationship/atom.actions';
import { actions$ as relationshipActions$ } from '@/engine/modules/relationship/generator.actions';
import { actions as settingsActions } from '@/engine/modules/settings/atom.actions';
import { actions$ as settingsActions$ } from '@/engine/modules/settings/generator.actions';
import { actions as tableActions } from '@/engine/modules/table/atom.actions';
import { actions$ as tableActions$ } from '@/engine/modules/table/generator.actions';
import { actions as tableColumnActions } from '@/engine/modules/table-column/atom.actions';
import { actions$ as tableColumnActions$ } from '@/engine/modules/table-column/generator.actions';

export type Actions = typeof editorActions &
  typeof editorActions$ &
  typeof indexActions &
  typeof indexActions$ &
  typeof indexColumnActions &
  typeof indexColumnActions$ &
  typeof memoActions &
  typeof memoActions$ &
  typeof relationshipActions &
  typeof relationshipActions$ &
  typeof settingsActions &
  typeof settingsActions$ &
  typeof tableActions &
  typeof tableActions$ &
  typeof tableColumnActions &
  typeof tableColumnActions$;

export const actions: Actions = Object.freeze({
  ...editorActions,
  ...editorActions$,
  ...indexActions,
  ...indexActions$,
  ...indexColumnActions,
  ...indexColumnActions$,
  ...memoActions,
  ...memoActions$,
  ...relationshipActions,
  ...relationshipActions$,
  ...settingsActions,
  ...settingsActions$,
  ...tableActions,
  ...tableActions$,
  ...tableColumnActions,
  ...tableColumnActions$,
});
