import {
  pushStreamHistoryMap,
  pushUndoHistoryMap,
} from '@/engine/history.actions';
import type { ActionMap as EditorActionMap } from '@/engine/modules/editor/actions';
import type { ActionMap as IndexActionMap } from '@/engine/modules/index/actions';
import type { ActionMap as IndexColumnActionMap } from '@/engine/modules/index-column/actions';
import type { ActionMap as MemoActionMap } from '@/engine/modules/memo/actions';
import type { ActionMap as RelationshipActionMap } from '@/engine/modules/relationship/actions';
import type { ActionMap as SettingsActionMap } from '@/engine/modules/settings/actions';
import type { ActionMap as TableActionMap } from '@/engine/modules/table/actions';
import type { ActionMap as TableColumnActionMap } from '@/engine/modules/table-column/actions';
import { arrayHas } from '@/utils/arrayHas';

/*
 * The action classification lists, kept apart from the merged creator registry
 * in actions.ts. A store needs these strings to route what it dispatches, and
 * importing them from the registry's module evaluated every generator action,
 * the four schema importers behind them included, in any graph that built a
 * store: the export-png worker's among them.
 */

export type RootActionMap = EditorActionMap &
  TableActionMap &
  TableColumnActionMap &
  MemoActionMap &
  RelationshipActionMap &
  SettingsActionMap &
  IndexActionMap &
  IndexColumnActionMap;

export type ActionType = keyof RootActionMap;

export const ChangeActionTypes: ReadonlyArray<ActionType> = [
  // table
  'table.add',
  'table.move',
  'table.moveTo',
  'table.remove',
  'table.changeName',
  'table.changeComment',
  'table.changeColor',
  'table.sort',
  // column
  'column.add',
  'column.remove',
  'column.changeName',
  'column.changeComment',
  'column.changeDataType',
  'column.changeDefault',
  'column.changeAutoIncrement',
  'column.changePrimaryKey',
  'column.changeUnique',
  'column.changeNotNull',
  'column.move',
  // relationship
  'relationship.add',
  'relationship.remove',
  'relationship.changeType',
  // index
  'index.add',
  'index.remove',
  'index.changeName',
  'index.changeUnique',
  // indexColumn
  'indexColumn.add',
  'indexColumn.remove',
  'indexColumn.move',
  'indexColumn.changeOrderType',
  // memo
  'memo.add',
  'memo.move',
  'memo.moveTo',
  'memo.remove',
  'memo.changeValue',
  'memo.changeColor',
  'memo.resize',
  // settings
  'settings.changeDatabaseName',
  'settings.changeZoomLevel',
  'settings.streamZoomLevel',
  'settings.scrollTo',
  'settings.streamScrollTo',
  'settings.changeShow',
  'settings.changeDatabase',
  'settings.changeCanvasType',
  'settings.changeLanguage',
  'settings.changeTableNameCase',
  'settings.changeColumnNameCase',
  'settings.changeBracketType',
  'settings.changeRelationshipDataTypeSync',
  'settings.changeRelationshipOptimization',
  'settings.changeColumnOrder',
  'settings.changeMaxWidthComment',
  'settings.changeIgnoreSaveSettings',
  // editor
  'editor.loadJson',
  'editor.clear',
];

const hasReadonlyIgnore = arrayHas([
  'settings.changeZoomLevel',
  'settings.streamZoomLevel',
  'settings.scrollTo',
  'settings.streamScrollTo',
  'settings.changeDatabase',
  'settings.changeCanvasType',
  'settings.changeLanguage',
  'settings.changeTableNameCase',
  'settings.changeColumnNameCase',
  'settings.changeBracketType',
]);

export const ReadonlyIgnoreActionTypes: ReadonlyArray<ActionType> = [
  ...ChangeActionTypes.filter(type => !hasReadonlyIgnore(type)),
];

const hasViewIgnorePass = arrayHas<ActionType>([
  'editor.loadJson',
  'editor.clear',
]);

/**
 * What a view keeps from the document while it is active: every edit a
 * readonly host refuses, less the host replacing the document outright, which
 * a view cannot stand in the way of and answers by closing.
 */
export const ViewIgnoreActionTypes: ReadonlyArray<ActionType> = [
  ...ReadonlyIgnoreActionTypes.filter(type => !hasViewIgnorePass(type)),
];

export const SharedStreamActionTypes: ReadonlyArray<ActionType> = [
  'editor.sharedMouseTracker',
  'editor.sharedFocusTracker',
  'editor.sharedSelectionTracker',
  'editor.sharedDragSelectTracker',
];

export const SharedActionTypes: ReadonlyArray<ActionType> = [
  ...ChangeActionTypes,
  ...SharedStreamActionTypes,
  'editor.getLWW',
  'editor.mergeLWW',
];

export const SharedFollowingActionTypes: ReadonlyArray<ActionType> = [
  'settings.changeZoomLevel',
  'settings.streamZoomLevel',
  'settings.scrollTo',
  'settings.streamScrollTo',
  'settings.changeCanvasType',
];

export const StreamRegroupMoveActionTypes: ReadonlyArray<ActionType> = [
  'table.move',
  'memo.move',
];

export const StreamRegroupColorActionTypes: ReadonlyArray<ActionType> = [
  'table.changeColor',
  'memo.changeColor',
];

export const StreamRegroupScrollActionTypes: ReadonlyArray<ActionType> = [
  'settings.streamZoomLevel',
  'settings.streamScrollTo',
];

export const StreamActionTypes: ReadonlyArray<ActionType> = [
  ...(Object.keys(pushStreamHistoryMap) as ActionType[]),
];

export const HistoryActionTypes: ReadonlyArray<ActionType> = [
  ...(Object.keys(pushUndoHistoryMap) as ActionType[]),
  ...StreamActionTypes,
];
