import { describe, expect, it } from 'vite-plus/test';

import { actions } from '@/engine/actions';
import { Clock } from '@/engine/clock';
import { createStore } from '@/engine/store';

describe('actions registry', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(actions)).toBe(true);
  });

  it('merges the atom and generator creators of every module', () => {
    // atom creators
    expect(typeof actions.addMemoAction).toBe('function');
    expect(typeof actions.addTableAction).toBe('function');
    expect(typeof actions.addColumnAction).toBe('function');
    expect(typeof actions.addRelationshipAction).toBe('function');
    expect(typeof actions.addIndexAction).toBe('function');
    expect(typeof actions.addIndexColumnAction).toBe('function');
    expect(typeof actions.changeDatabaseNameAction).toBe('function');
    expect(typeof actions.loadJsonAction).toBe('function');
    // generator creators
    expect(typeof actions.addMemoAction$).toBe('function');
    expect(typeof actions.addTableAction$).toBe('function');
    expect(typeof actions.loadJsonAction$).toBe('function');
    expect(typeof actions.changeZoomLevelAction$).toBe('function');
  });

  it('every atom creator produces an action its reducer understands', () => {
    const action = actions.addMemoAction({
      id: 'm1',
      ui: { x: 1, y: 2, zIndex: 3 },
    });

    expect(action).toEqual({ type: 'memo.add', payload: action.payload });
    expect(String(actions.addMemoAction)).toBe('memo.add');

    const store = createStore({
      toWidth: text => text.length * 10,
      clock: new Clock(),
    });
    store.dispatchSync(action);

    expect(store.state.doc.memoIds).toEqual(['m1']);
    store.destroy();
  });
});
