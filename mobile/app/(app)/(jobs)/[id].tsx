import { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import { useOffline } from '../../../contexts/OfflineContext';
import { getJobById, updateJobStatus, assignJob, deleteJob, getTechnicians } from '../../../services/jobs';
import type { Technician } from '../../../services/jobs';
import { getLocalJobById, updateLocalJobStatus, markJobSyncStatus, deleteLocalJob } from '../../../services/localDb';
import { enqueueAction } from '../../../services/actionQueue';
import { showConflictAlert } from '../../../components/ConflictAlert';
import StatusBadge from '../../../components/StatusBadge';
import PriorityBadge from '../../../components/PriorityBadge';
import PhotoSection from '../../../components/PhotoSection';
import { NEXT_STATUS, STATUS_ACTION_LABELS } from '../../../constants/jobs';
import type { Job, Attachment } from '../../../types/job';
import type { JobSyncStatus } from '../../../types/sync';

type JobWithSync = Job & { syncStatus?: JobSyncStatus };

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { isOnline, db, triggerSync } = useOffline();
  const router = useRouter();

  const [job, setJob] = useState<JobWithSync | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  const loadFromCache = useCallback(() => {
    if (!id) return null;
    return getLocalJobById(db, id);
  }, [db, id]);

  const fetchJob = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError('');

    const cached = loadFromCache();
    if (cached) {
      setJob(cached);
      setIsLoading(false);
    }

    if (isOnline) {
      try {
        const result = await getJobById(id);
        setJob(result.data);
      } catch (err) {
        if (!cached) {
          setError(err instanceof Error ? err.message : 'Failed to load job');
        }
      }
    } else if (!cached) {
      setError('Job not available offline');
    }

    setIsLoading(false);
  }, [id, isOnline, loadFromCache]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  const canAssign = (user?.role === 'admin' || user?.role === 'dispatcher') &&
    job?.status !== 'completed' && job?.status !== 'cancelled';

  const canCancel = (user?.role === 'admin' || user?.role === 'dispatcher') &&
    job?.status !== 'completed' && job?.status !== 'cancelled';

  const canEdit = user?.role === 'admin' || user?.role === 'dispatcher';
  const canDelete = user?.role === 'admin';

  useEffect(() => {
    if (canAssign && isOnline) {
      getTechnicians().then(setTechnicians).catch(() => {});
    }
  }, [canAssign, isOnline]);

  const nextStatus = job ? NEXT_STATUS[job.status] : null;
  const actionLabel = job ? STATUS_ACTION_LABELS[job.status] : '';
  const hasConflict = job?.syncStatus === 'conflict';

  const handleStatusTransition = async () => {
    if (!job || !nextStatus) return;

    if (isOnline && job._etag) {
      setIsUpdating(true);
      try {
        const result = await updateJobStatus(job.id, nextStatus, job._etag);
        setJob(result.data);
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update status');
        fetchJob();
      } finally {
        setIsUpdating(false);
      }
    } else {
      updateLocalJobStatus(db, job.id, nextStatus);
      enqueueAction(db, {
        actionType: 'UPDATE_STATUS',
        payload: { jobId: job.id, status: nextStatus, etag: job._etag || '' },
      });
      setJob({ ...job, status: nextStatus, syncStatus: 'pending' });
    }
  };

  const handleAssign = async () => {
    if (!job || !selectedTechId) return;
    setIsAssigning(true);
    try {
      const result = await assignJob(job.id, selectedTechId);
      setJob(result.data);
      setSelectedTechId(null);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to assign');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleConflictResolve = async () => {
    if (!job) return;
    const choice = await showConflictAlert(job.title);

    if (choice === 'server') {
      markJobSyncStatus(db, job.id, 'synced');
      if (isOnline) {
        try {
          const result = await getJobById(job.id);
          setJob(result.data);
        } catch {
          const cached = loadFromCache();
          if (cached) setJob({ ...cached, syncStatus: 'synced' });
        }
      } else {
        setJob({ ...job, syncStatus: 'synced' });
      }
    } else {
      if (isOnline) {
        await triggerSync();
        const cached = loadFromCache();
        if (cached) setJob(cached);
      } else {
        Alert.alert('Offline', 'Will retry when back online.');
      }
    }
  };

  const handleCancel = () => {
    if (!job || !job._etag) return;
    Alert.alert(
      'Cancel Job',
      `Are you sure you want to cancel "${job.title}"? This cannot be undone.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancel Job',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              const result = await updateJobStatus(job.id, 'cancelled', job._etag!);
              setJob(result.data);
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to cancel job');
              fetchJob();
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    if (!job) return;
    Alert.alert(
      'Delete Job',
      `Are you sure you want to permanently delete "${job.title}"? This cannot be undone.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteJob(job.id);
              deleteLocalJob(db, job.id);
              router.back();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete job');
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3C3A2E" />
      </View>
    );
  }

  if (error || !job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Job not found'}</Text>
        <TouchableOpacity onPress={fetchJob} style={styles.retryButton} activeOpacity={0.7}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const photos = (job.attachments ?? []).filter((a) => !!a.sasUrl);

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setPhotoIndex(idx);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Photo Carousel */}
      {photos.length > 0 && (
        <View style={styles.carouselWrapper}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScrollEnd}
          >
            {photos.map((att) => (
              <Image
                key={att.id}
                source={{ uri: att.sasUrl }}
                style={styles.carouselImage}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
          {photos.length > 1 && (
            <View style={styles.dotsRow}>
              {photos.map((_, i) => (
                <View key={i} style={[styles.dot, photoIndex === i && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Conflict Banner */}
      {hasConflict && (
        <TouchableOpacity style={styles.conflictBanner} onPress={handleConflictResolve} activeOpacity={0.7}>
          <Text style={styles.conflictText}>Conflict detected — tap to resolve</Text>
        </TouchableOpacity>
      )}

      {/* Pending sync indicator */}
      {job.syncStatus === 'pending' && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>Pending sync</Text>
        </View>
      )}

      {/* Header Card */}
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { flex: 1 }]}>{job.title}</Text>
          {canEdit && isOnline && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => router.push({ pathname: '/(app)/(jobs)/edit', params: { id: job.id } })}
              activeOpacity={0.7}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.badgeRow}>
          <StatusBadge status={job.status} />
          <PriorityBadge priority={job.priority} />
        </View>
      </View>

      {/* Description */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Description</Text>
        <Text style={styles.description}>{job.description}</Text>
      </View>

      {/* Location */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Location</Text>
        <Text style={styles.locationName}>{job.location.storeName}</Text>
        <Text style={styles.locationDetail}>{job.location.address}</Text>
        <Text style={styles.locationDetail}>
          {job.location.city}, {job.location.state} {job.location.zipCode}
        </Text>
      </View>

      {/* Details */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Created By</Text>
          <Text style={styles.detailValue}>{job.createdByName || job.createdBy}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Assigned To</Text>
          <Text style={styles.detailValue}>{job.assignedToName || job.assignedTo || 'Unassigned'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Created</Text>
          <Text style={styles.detailValue}>{new Date(job.createdAt).toLocaleString()}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Updated</Text>
          <Text style={styles.detailValue}>{new Date(job.updatedAt).toLocaleString()}</Text>
        </View>
      </View>

      {/* Photos */}
      <View style={styles.card}>
        <PhotoSection
          jobId={job.id}
          attachments={job.attachments ?? []}
          onAttachmentsChange={(atts: Attachment[]) => setJob({ ...job, attachments: atts })}
          canEdit={isOnline && !hasConflict && (user?.role === 'admin' || (job.status !== 'completed' && job.status !== 'cancelled'))}
        />
      </View>

      {/* Status Transition */}
      {nextStatus && actionLabel && !hasConflict ? (
        <TouchableOpacity
          style={[styles.actionButton, isUpdating && styles.buttonDisabled]}
          onPress={handleStatusTransition}
          disabled={isUpdating}
          activeOpacity={0.7}
        >
          {isUpdating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionButtonText}>{actionLabel}</Text>
          )}
        </TouchableOpacity>
      ) : null}

      {/* Assign / Reassign Technician (online only) */}
      {canAssign && isOnline && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>
            {job.assignedTo ? 'Reassign Technician' : 'Assign Technician'}
          </Text>
          {technicians.length === 0 ? (
            <Text style={styles.noTechText}>No technicians available</Text>
          ) : (
            technicians.map((tech) => {
              const isSelected = selectedTechId === tech.id;
              return (
                <TouchableOpacity
                  key={tech.id}
                  style={[styles.techRow, isSelected && styles.techRowSelected]}
                  onPress={() => setSelectedTechId(isSelected ? null : tech.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.techInfo}>
                    <Text style={[styles.techName, isSelected && styles.techNameSelected]}>
                      {tech.displayName}
                    </Text>
                    <Text style={styles.techEmail}>{tech.email}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          {selectedTechId && (
            <TouchableOpacity
              style={[styles.assignButton, isAssigning && styles.buttonDisabled]}
              onPress={handleAssign}
              disabled={isAssigning}
              activeOpacity={0.7}
            >
              {isAssigning ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {job.assignedTo ? 'Reassign' : 'Assign'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Cancel Job (admin + dispatcher, online only) */}
      {canCancel && isOnline && !hasConflict && (
        <TouchableOpacity
          style={[styles.cancelButton, isCancelling && styles.buttonDisabled]}
          onPress={handleCancel}
          disabled={isCancelling}
          activeOpacity={0.7}
        >
          {isCancelling ? (
            <ActivityIndicator color="#C4432B" />
          ) : (
            <Text style={styles.cancelButtonText}>Cancel Job</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Delete Job (admin only, online only) */}
      {canDelete && isOnline && (
        <TouchableOpacity
          style={[styles.deleteButton, isDeleting && styles.buttonDisabled]}
          onPress={handleDelete}
          disabled={isDeleting}
          activeOpacity={0.7}
        >
          {isDeleting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionButtonText}>Delete Job</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F3EE',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  carouselWrapper: {
    marginHorizontal: -20,
    marginBottom: 16,
  },
  carouselImage: {
    width: SCREEN_WIDTH,
    height: 260,
    backgroundColor: '#EEEDEA',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#D5D3CB',
  },
  dotActive: {
    backgroundColor: '#3C3A2E',
    width: 20,
    borderRadius: 4,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F3EE',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  conflictBanner: {
    backgroundColor: '#C4432B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  conflictText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  pendingBanner: {
    backgroundColor: '#B8860B',
    borderRadius: 12,
    padding: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  pendingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1A',
    marginBottom: 10,
  },
  editButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3C3A2E',
    marginTop: 2,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C3A2E',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9C9C90',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: '#4A4A42',
    lineHeight: 22,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1A',
    marginBottom: 4,
  },
  locationDetail: {
    fontSize: 14,
    color: '#6B6B60',
    marginTop: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B6B60',
  },
  detailValue: {
    fontSize: 14,
    color: '#1C1C1A',
    fontWeight: '500',
    maxWidth: '55%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEEDEA',
    marginVertical: 6,
  },
  actionButton: {
    backgroundColor: '#3C3A2E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  noTechText: {
    fontSize: 14,
    color: '#9C9C90',
    textAlign: 'center',
    paddingVertical: 16,
  },
  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E3DB',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  techRowSelected: {
    borderColor: '#3C3A2E',
    backgroundColor: '#F4F3EE',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D5D3CB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioSelected: {
    borderColor: '#3C3A2E',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3C3A2E',
  },
  techInfo: {
    flex: 1,
  },
  techName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1A',
  },
  techNameSelected: {
    color: '#3C3A2E',
  },
  techEmail: {
    fontSize: 13,
    color: '#9C9C90',
    marginTop: 2,
  },
  assignButton: {
    backgroundColor: '#4A7C59',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButton: {
    borderWidth: 1.5,
    borderColor: '#C4432B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  cancelButtonText: {
    color: '#C4432B',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#C4432B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
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
});
