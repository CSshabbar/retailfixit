import { Stack } from 'expo-router';

export default function JobsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#F4F3EE' },
        headerTintColor: '#3C3A2E',
        headerTitleStyle: { fontWeight: '600', color: '#1C1C1A' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#F4F3EE' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Job Details' }} />
      <Stack.Screen
        name="create"
        options={{ title: 'New Job', presentation: 'modal' }}
      />
      <Stack.Screen
        name="edit"
        options={{ title: 'Edit Job', presentation: 'modal' }}
      />
    </Stack>
  );
}
