declare module 'expo-router' {
  export const router: any;
  export const useLocalSearchParams: <T = Record<string, string>>() => T;
  export const usePathname: () => string;
  export const Stack: any;
  export const Tabs: any;
  export const Redirect: any;
  export const ExpoRoot: any;
  export const Link: any;
  export const ErrorBoundary: any;
}

declare module 'expo-router/html' {
  export const ScrollViewStyleReset: any;
  export const ScrollView: any;
}
