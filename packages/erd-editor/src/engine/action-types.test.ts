import { describe, expect, it } from 'vite-plus/test';

import {
  ChangeActionTypes,
  HistoryActionTypes,
  ReadonlyIgnoreActionTypes,
  SharedActionTypes,
  SharedFollowingActionTypes,
  SharedStreamActionTypes,
  StreamActionTypes,
  StreamRegroupColorActionTypes,
  StreamRegroupMoveActionTypes,
  StreamRegroupScrollActionTypes,
  ViewIgnoreActionTypes,
} from '@/engine/action-types';
import {
  pushStreamHistoryMap,
  pushUndoHistoryMap,
} from '@/engine/history.actions';
import { ActionType as EditorActionType } from '@/engine/modules/editor/actions';
import { actions as editorActions } from '@/engine/modules/editor/atom.actions';
import { ActionType as IndexActionType } from '@/engine/modules/index/actions';
import { actions as indexActions } from '@/engine/modules/index/atom.actions';
import { ActionType as IndexColumnActionType } from '@/engine/modules/index-column/actions';
import { actions as indexColumnActions } from '@/engine/modules/index-column/atom.actions';
import { ActionType as MemoActionType } from '@/engine/modules/memo/actions';
import { actions as memoActions } from '@/engine/modules/memo/atom.actions';
import { ActionType as RelationshipActionType } from '@/engine/modules/relationship/actions';
import { actions as relationshipActions } from '@/engine/modules/relationship/atom.actions';
import { ActionType as SettingsActionType } from '@/engine/modules/settings/actions';
import { actions as settingsActions } from '@/engine/modules/settings/atom.actions';
import { ActionType as TableActionType } from '@/engine/modules/table/actions';
import { actions as tableActions } from '@/engine/modules/table/atom.actions';
import { ActionType as TableColumnActionType } from '@/engine/modules/table-column/actions';
import { actions as tableColumnActions } from '@/engine/modules/table-column/atom.actions';

const allActionTypes = new Set<string>([
  ...Object.values(EditorActionType),
  ...Object.values(TableActionType),
  ...Object.values(TableColumnActionType),
  ...Object.values(MemoActionType),
  ...Object.values(RelationshipActionType),
  ...Object.values(SettingsActionType),
  ...Object.values(IndexActionType),
  ...Object.values(IndexColumnActionType),
]);

const atomActionTypes = new Set<string>(
  [
    editorActions,
    indexActions,
    indexColumnActions,
    memoActions,
    relationshipActions,
    settingsActions,
    tableActions,
    tableColumnActions,
  ].flatMap(barrel => Object.values(barrel).map(creator => creator.type))
);

const READONLY_IGNORED = [
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
];

describe('ChangeActionTypes', () => {
  it('has no duplicates', () => {
    expect(new Set(ChangeActionTypes).size).toBe(ChangeActionTypes.length);
  });

  it('only references action types declared by a module', () => {
    const unknown = ChangeActionTypes.filter(
      type => !allActionTypes.has(type as string)
    );

    expect(unknown).toEqual([]);
  });

  it('only references types backed by an atom action creator', () => {
    const missing = ChangeActionTypes.filter(
      type => !atomActionTypes.has(type as string)
    );

    expect(missing).toEqual([]);
  });

  it('covers every module namespace', () => {
    const namespaces = new Set(
      ChangeActionTypes.map(type => (type as string).split('.')[0])
    );

    expect([...namespaces].sort()).toEqual([
      'column',
      'editor',
      'index',
      'indexColumn',
      'memo',
      'relationship',
      'settings',
      'table',
    ]);
  });

  it('excludes purely local editor UI actions', () => {
    expect(ChangeActionTypes).not.toContain('editor.select');
    expect(ChangeActionTypes).not.toContain('editor.changeViewport');
    expect(ChangeActionTypes).not.toContain('editor.sharedMouseTracker');
    expect(ChangeActionTypes).not.toContain('memo.changeZIndex');
  });
});

describe('ReadonlyIgnoreActionTypes', () => {
  it('is ChangeActionTypes minus the view-only settings actions', () => {
    expect(ReadonlyIgnoreActionTypes).toEqual(
      ChangeActionTypes.filter(type => !READONLY_IGNORED.includes(type))
    );
    expect(ReadonlyIgnoreActionTypes.length).toBe(
      ChangeActionTypes.length - READONLY_IGNORED.length
    );
  });

  it('drops each view-only settings action', () => {
    for (const type of READONLY_IGNORED) {
      expect(ChangeActionTypes).toContain(type);
      expect(ReadonlyIgnoreActionTypes).not.toContain(type);
    }
  });

  it('keeps document-mutating actions', () => {
    expect(ReadonlyIgnoreActionTypes).toContain('table.add');
    expect(ReadonlyIgnoreActionTypes).toContain('column.remove');
    expect(ReadonlyIgnoreActionTypes).toContain('editor.loadJson');
  });
});

describe('ViewIgnoreActionTypes', () => {
  it('is ReadonlyIgnoreActionTypes minus the two document replacements', () => {
    expect(ViewIgnoreActionTypes).toEqual(
      ReadonlyIgnoreActionTypes.filter(
        type => type !== 'editor.loadJson' && type !== 'editor.clear'
      )
    );
    expect(ViewIgnoreActionTypes.length).toBe(
      ReadonlyIgnoreActionTypes.length - 2
    );
  });

  it('only references types backed by an atom action creator', () => {
    const missing = ViewIgnoreActionTypes.filter(
      type => !atomActionTypes.has(type as string)
    );

    expect(missing).toEqual([]);
  });
});

describe('view action types', () => {
  const VIEW_ACTION_TYPES = [
    'editor.viewOpen',
    'editor.viewClose',
    'editor.viewScrollTo',
    'editor.viewStreamScrollTo',
    'editor.viewChangeZoomLevel',
    'editor.viewStreamZoomLevel',
    'editor.viewMoveTable',
    'editor.viewSetLayout',
    'editor.viewChangeShowMode',
    'editor.viewSetCenters',
    'editor.changeVisualizationMode',
  ];

  it('are declared by the editor module with an atom creator each', () => {
    for (const type of VIEW_ACTION_TYPES) {
      expect(allActionTypes.has(type)).toBe(true);
      expect(atomActionTypes.has(type)).toBe(true);
    }
  });

  it('stay out of every list that reaches the file, the history or a peer', () => {
    for (const type of VIEW_ACTION_TYPES) {
      expect(ChangeActionTypes).not.toContain(type);
      expect(HistoryActionTypes).not.toContain(type);
      expect(SharedActionTypes).not.toContain(type);
      expect(ReadonlyIgnoreActionTypes).not.toContain(type);
      expect(ViewIgnoreActionTypes).not.toContain(type);
    }
  });
});

describe('shared action types', () => {
  it('SharedStreamActionTypes tracks the ephemeral presence streams', () => {
    expect(SharedStreamActionTypes).toEqual([
      'editor.sharedMouseTracker',
      'editor.sharedFocusTracker',
      'editor.sharedSelectionTracker',
      'editor.sharedDragSelectTracker',
    ]);
  });

  it('SharedActionTypes is ChangeActionTypes plus stream and LWW sync', () => {
    expect(SharedActionTypes).toEqual([
      ...ChangeActionTypes,
      ...SharedStreamActionTypes,
      'editor.getLWW',
      'editor.mergeLWW',
    ]);
    expect(new Set(SharedActionTypes).size).toBe(SharedActionTypes.length);
  });

  it('SharedFollowingActionTypes is a subset of the readonly-ignored settings', () => {
    for (const type of SharedFollowingActionTypes) {
      expect(READONLY_IGNORED).toContain(type as string);
      expect(ChangeActionTypes).toContain(type);
    }
    expect(SharedFollowingActionTypes).toEqual([
      'settings.changeZoomLevel',
      'settings.streamZoomLevel',
      'settings.scrollTo',
      'settings.streamScrollTo',
      'settings.changeCanvasType',
    ]);
  });
});

describe('stream regroup action types', () => {
  it('groups move, color and scroll streams', () => {
    expect(StreamRegroupMoveActionTypes).toEqual(['table.move', 'memo.move']);
    expect(StreamRegroupColorActionTypes).toEqual([
      'table.changeColor',
      'memo.changeColor',
    ]);
    expect(StreamRegroupScrollActionTypes).toEqual([
      'settings.streamZoomLevel',
      'settings.streamScrollTo',
    ]);
  });

  it('regrouped types are all change actions', () => {
    for (const type of [
      ...StreamRegroupMoveActionTypes,
      ...StreamRegroupColorActionTypes,
      ...StreamRegroupScrollActionTypes,
    ]) {
      expect(ChangeActionTypes).toContain(type);
    }
  });
});

describe('history action types', () => {
  it('StreamActionTypes mirrors the stream history map keys', () => {
    expect(StreamActionTypes).toEqual(Object.keys(pushStreamHistoryMap));
    expect(StreamActionTypes.length).toBeGreaterThan(0);
  });

  it('HistoryActionTypes is the undo map keys followed by the stream keys', () => {
    expect(HistoryActionTypes).toEqual([
      ...Object.keys(pushUndoHistoryMap),
      ...StreamActionTypes,
    ]);
  });

  it('every history action type is a known module action type', () => {
    const unknown = HistoryActionTypes.filter(
      type => !allActionTypes.has(type as string)
    );

    expect(unknown).toEqual([]);
  });

  it('records undo entries for structural changes', () => {
    expect(HistoryActionTypes).toContain('table.add');
    expect(HistoryActionTypes).toContain('memo.remove');
    expect(HistoryActionTypes).toContain('relationship.add');
  });
});
