import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import { useOffline } from '../../../contexts/OfflineContext';
import { useJobs } from '../../../hooks/useJobs';
import JobCard from '../../../components/JobCard';
import StatusFilterBar from '../../../components/StatusFilterBar';

export default function JobListScreen() {
  const { user } = useAuth();
  const { isOnline, isSyncing, pendingCount, isRealTimeConnected, lastSyncError } = useOffline();
  const { jobs, isLoading, isRefreshing, error, activeFilter, setActiveFilter, refresh } = useJobs();
  const [showStatus, setShowStatus] = useState(false);

  const canCreateJob = user?.role === 'admin' || user?.role === 'dispatcher';

  const dotColor = isOnline ? (isRealTimeConnected ? '#4A7C59' : '#B8860B') : '#C4432B';

  const handleJobPress = (id: string) => {
    router.push(`/(app)/(jobs)/${id}`);
  };

  const handleCreatePress = () => {
    router.push('/(app)/(jobs)/create');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Title Row */}
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Text style={styles.title}>Jobs</Text>
          <TouchableOpacity
            onPress={() => setShowStatus((v) => !v)}
            style={styles.statusButton}
            activeOpacity={0.7}
          >
            <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
          </TouchableOpacity>
        </View>
        {canCreateJob && (
          <TouchableOpacity onPress={handleCreatePress} style={styles.createButton} activeOpacity={0.7}>
            <Text style={styles.createButtonText}>+ New</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Connection Status Card */}
      {showStatus && (
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusRowDot, { backgroundColor: isOnline ? '#4A7C59' : '#C4432B' }]} />
            <Text style={styles.statusLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusRow}>
            <View style={[styles.statusRowDot, { backgroundColor: isRealTimeConnected ? '#4A7C59' : '#9C9C90' }]} />
            <Text style={styles.statusLabel}>Real-time {isRealTimeConnected ? 'connected' : 'disconnected'}</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Sync</Text>
            <Text style={[styles.statusValue, isSyncing && { color: '#3C3A2E' }]}>
              {isSyncing ? 'Syncing...' : 'Idle'}
            </Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Pending</Text>
            <Text style={[styles.statusValue, pendingCount > 0 && { color: '#B8860B' }]}>
              {pendingCount}
            </Text>
          </View>
          {lastSyncError && (
            <>
              <View style={styles.statusDivider} />
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Error</Text>
                <Text style={[styles.statusValue, { color: '#C4432B' }]} numberOfLines={1}>
                  {lastSyncError}
                </Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* Status Filter */}
      <StatusFilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />

      {/* Job List */}
      {isLoading && !isRefreshing ? (
        <ActivityIndicator size="large" color="#3C3A2E" style={styles.loader} />
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={refresh} style={styles.retryButton} activeOpacity={0.7}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <JobCard job={item} onPress={handleJobPress} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3C3A2E" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>&#128203;</Text>
              <Text style={styles.emptyTitle}>No jobs found</Text>
              <Text style={styles.emptySubtitle}>
                {activeFilter !== 'all' ? 'Try a different filter' : 'Jobs will appear here'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F3EE',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1A',
  },
  statusButton: {
    padding: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 4,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  statusRowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  statusLabel: {
    fontSize: 14,
    color: '#6B6B60',
    flex: 1,
  },
  statusValue: {
    fontSize: 14,
    color: '#1C1C1A',
    fontWeight: '500',
  },
  statusDivider: {
    height: 1,
    backgroundColor: '#EEEDEA',
    marginVertical: 6,
  },
  createButton: {
    backgroundColor: '#3C3A2E',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loader: {
    marginTop: 40,
  },
  errorContainer: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    color: '#C4432B',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#3C3A2E',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 20,
    paddingTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1A',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9C9C90',
  },
});
