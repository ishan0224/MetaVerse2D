type Listener = () => void;

function cloneDefaultState<T>(defaultState: T): T {
  if (Array.isArray(defaultState)) {
    return [...defaultState] as T;
  }

  if (typeof defaultState === 'object' && defaultState !== null) {
    return { ...(defaultState as Record<string, unknown>) } as T;
  }

  return defaultState;
}

export function createObservableStore<T>(defaultState: T): {
  getState: () => T;
  setState: (updater: (prev: T) => T) => void;
  subscribe: (listener: Listener) => () => void;
  reset: () => void;
} {
  let state = cloneDefaultState(defaultState);
  const listeners = new Set<Listener>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getState: () => state,
    setState: (updater) => {
      const nextState = updater(state);
      if (Object.is(nextState, state)) {
        return;
      }
      state = nextState;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: () => {
      state = cloneDefaultState(defaultState);
      emit();
    },
  };
}
