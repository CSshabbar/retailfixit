import { Alert } from 'react-native';

/**
 * Shows a conflict resolution dialog.
 * Returns 'server' if user picks server version, 'retry' to retry their change.
 */
export function showConflictAlert(jobTitle: string): Promise<'server' | 'retry'> {
  return new Promise((resolve) => {
    Alert.alert(
      'Conflict Detected',
      `"${jobTitle}" was modified by someone else while you were offline. What would you like to do?`,
      [
        {
          text: 'Use Server Version',
          style: 'destructive',
          onPress: () => resolve('server'),
        },
        {
          text: 'Retry My Change',
          onPress: () => resolve('retry'),
        },
      ],
      { cancelable: false },
    );
  });
}
