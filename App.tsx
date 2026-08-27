import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';

// Must be exported for Fast Refresh to work
export function App() {
  const ctx = (require as any).context('./client/app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
