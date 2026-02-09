import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOffline } from '../../contexts/OfflineContext';

export default function ActivityScreen() {
  const { isOnline, isSyncing, pendingCount, isRealTimeConnected, lastSyncError } = useOffline();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.header}>Activity</Text>

      {/* Connection Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connection</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: isOnline ? '#4A7C59' : '#C4432B' }]} />
          <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: isRealTimeConnected ? '#4A7C59' : '#9C9C90' }]} />
          <Text style={styles.statusText}>
            Real-time {isRealTimeConnected ? 'connected' : 'disconnected'}
          </Text>
        </View>
      </View>

      {/* Sync Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sync</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={[styles.infoValue, isSyncing && { color: '#3C3A2E' }]}>
            {isSyncing ? 'Syncing...' : 'Idle'}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Pending actions</Text>
          <Text style={[styles.infoValue, pendingCount > 0 && { color: '#B8860B' }]}>
            {pendingCount}
          </Text>
        </View>
        {lastSyncError && (
          <>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Last error</Text>
              <Text style={[styles.infoValue, { color: '#C4432B' }]} numberOfLines={2}>
                {lastSyncError}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>How it works</Text>
        <Text style={styles.description}>
          Jobs are cached locally for offline access. Changes made offline are queued and synced automatically when you reconnect. Real-time updates are pushed via SignalR when connected.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F3EE',
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1A',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9C9C90',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  statusText: {
    fontSize: 15,
    color: '#1C1C1A',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B6B60',
  },
  infoValue: {
    fontSize: 14,
    color: '#1C1C1A',
    fontWeight: '500',
    maxWidth: '50%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEEDEA',
    marginVertical: 10,
  },
  description: {
    fontSize: 14,
    color: '#6B6B60',
    lineHeight: 20,
  },
});
