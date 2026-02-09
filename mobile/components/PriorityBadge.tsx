import { StyleSheet, Text, View } from 'react-native';
import { PRIORITY_CONFIG } from '../constants/jobs';
import type { JobPriority } from '../types/job';

interface Props {
  priority: JobPriority;
}

export default function PriorityBadge({ priority }: Props) {
  const config = PRIORITY_CONFIG[priority];

  return (
    <View style={[styles.badge, { backgroundColor: config.backgroundColor }]}>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
