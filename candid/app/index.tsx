import { View } from 'react-native';

// Routing is handled entirely by _layout.tsx based on auth state.
// This screen renders briefly during initialization before navigation fires.
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: '#0a0a0a' }} />;
}
