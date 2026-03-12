type Listener = (ids: string[]) => void;

let pending: string[] = [];
let listeners: Listener[] = [];

function notify() { listeners.forEach(l => l([...pending])); }

export const uploadStore = {
  add(id: string) { pending = [...pending, id]; notify(); },
  remove(id: string) { pending = pending.filter(x => x !== id); notify(); },
  subscribe(l: Listener) {
    listeners = [...listeners, l];
    return () => { listeners = listeners.filter(x => x !== l); };
  },
};
