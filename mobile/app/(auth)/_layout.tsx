import { Stack } from 'expo-router';

/** Layout for authentication screens */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
