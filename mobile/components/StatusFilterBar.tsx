import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { STATUS_FILTERS } from '../constants/jobs';
import type { JobStatus } from '../types/job';

interface Props {
  activeFilter: JobStatus | 'all';
  onFilterChange: (filter: JobStatus | 'all') => void;
}

export default function StatusFilterBar({ activeFilter, onFilterChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={styles.scroll}
    >
      {STATUS_FILTERS.map((filter) => {
        const isActive = activeFilter === filter.key;
        return (
          <TouchableOpacity
            key={filter.key}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onFilterChange(filter.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  container: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E3DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#3C3A2E',
    borderColor: '#3C3A2E',
  },
  chipText: {
    fontSize: 13,
    color: '#6B6B60',
    fontWeight: '500',
    lineHeight: 16,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
