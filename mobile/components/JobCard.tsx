import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { STATUS_CONFIG } from '../constants/jobs';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import type { Job } from '../types/job';

interface Props {
  job: Job;
  onPress: (id: string) => void;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function JobCard({ job, onPress }: Props) {
  const statusConfig = STATUS_CONFIG[job.status];
  const photoUrl = job.thumbnailUrl || job.attachments?.[0]?.sasUrl;
  const hasThumbnail = !!photoUrl;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(job.id)}
      activeOpacity={0.7}
    >
      {/* Left: Photo or color swatch */}
      {hasThumbnail ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.photo}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.placeholder, { backgroundColor: statusConfig.accentColor }]}>
          <Text style={styles.placeholderIcon}>
            {statusConfig.label === 'Completed' ? '\u2713' : '\u2692'}
          </Text>
        </View>
      )}

      {/* Right: Content */}
      <View style={styles.body}>
        <View style={styles.badgeRow}>
          <StatusBadge status={job.status} />
          <PriorityBadge priority={job.priority} />
        </View>

        <Text style={styles.title} numberOfLines={1}>{job.title}</Text>
        <Text style={styles.description} numberOfLines={2}>{job.description}</Text>

        <View style={styles.bottomRow}>
          <Text style={styles.location} numberOfLines={1}>
            {job.location.storeName} · {job.location.city}, {job.location.state}
          </Text>
          <Text style={styles.date}>{relativeTime(job.updatedAt)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  photo: {
    width: 110,
    height: '100%',
  },
  placeholder: {
    width: 110,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  placeholderIcon: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.7)',
  },
  body: {
    flex: 1,
    padding: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1A',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: '#6B6B60',
    lineHeight: 18,
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  location: {
    fontSize: 12,
    color: '#9C9C90',
    flex: 1,
    marginRight: 8,
  },
  date: {
    fontSize: 11,
    color: '#9C9C90',
  },
});
