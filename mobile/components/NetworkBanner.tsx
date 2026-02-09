import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useOffline } from '../contexts/OfflineContext';

export default function NetworkBanner() {
  const { isOnline, isSyncing, pendingCount, isRealTimeConnected } = useOffline();

  // Hide when everything is fine
  if (isOnline && !isSyncing && pendingCount === 0) {
    return null;
  }

  let dotColor = '#4A7C59';
  let message = isRealTimeConnected ? 'Live' : 'Online';
  let bgColor = '#E0EDDF';
  let textColor = '#3D6B4F';

  if (!isOnline) {
    dotColor = '#C4432B';
    bgColor = '#FDEAE6';
    textColor = '#8B3A2A';
    message = pendingCount > 0
      ? `Offline  \u00B7  ${pendingCount} pending`
      : 'Offline  \u00B7  using cached data';
  } else if (isSyncing) {
    dotColor = '#3C3A2E';
    bgColor = '#EEEDEA';
    textColor = '#3C3A2E';
    message = 'Syncing...';
  } else if (pendingCount > 0) {
    dotColor = '#B8860B';
    bgColor = '#F9F0D8';
    textColor = '#8B7355';
    message = `${pendingCount} pending`;
  }

  return (
    <View style={[styles.banner, { backgroundColor: bgColor }]}>
      {isSyncing ? (
        <ActivityIndicator size="small" color={dotColor} style={styles.indicator} />
      ) : (
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      )}
      <Text style={[styles.text, { color: textColor }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  indicator: {
    marginRight: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
