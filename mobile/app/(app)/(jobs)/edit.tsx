import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useOffline } from '../../../contexts/OfflineContext';
import { getJobById, updateJob } from '../../../services/jobs';
import { getLocalJobById } from '../../../services/localDb';
import { PRIORITY_CONFIG } from '../../../constants/jobs';
import type { Job, JobPriority } from '../../../types/job';

const PRIORITIES: JobPriority[] = ['low', 'medium', 'high', 'urgent'];

export default function EditJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isOnline, db } = useOffline();

  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<JobPriority>('medium');
  const [storeName, setStoreName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) return;
      // Try cache first
      const cached = getLocalJobById(db, id);
      let data: Job | null = cached;

      if (isOnline) {
        try {
          const result = await getJobById(id);
          data = result.data;
        } catch {
          // fall back to cache
        }
      }

      if (data) {
        setJob(data);
        setTitle(data.title);
        setDescription(data.description);
        setPriority(data.priority);
        setStoreName(data.location.storeName);
        setAddress(data.location.address);
        setCity(data.location.city);
        setState(data.location.state);
        setZipCode(data.location.zipCode);
      }
      setIsLoading(false);
    }
    load();
  }, [id, db, isOnline]);

  const handleSave = async () => {
    if (!job || !job._etag) return;

    if (!isOnline) {
      setError('You must be online to edit a job');
      return;
    }

    if (!title.trim()) { setError('Title is required'); return; }
    if (!description.trim()) { setError('Description is required'); return; }
    if (!storeName.trim() || !address.trim() || !city.trim() || !state.trim() || !zipCode.trim()) {
      setError('All location fields are required');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await updateJob(job.id, {
        title: title.trim(),
        description: description.trim(),
        priority,
        location: {
          storeName: storeName.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          zipCode: zipCode.trim(),
        },
        _etag: job._etag,
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3C3A2E" />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Job not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Job title"
            placeholderTextColor="#9C9C90"
            editable={!isSubmitting}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the work needed"
            placeholderTextColor="#9C9C90"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!isSubmitting}
          />

          <Text style={styles.label}>Priority</Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => {
              const config = PRIORITY_CONFIG[p];
              const isActive = priority === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityChip,
                    isActive && { backgroundColor: config.backgroundColor, borderColor: config.color },
                  ]}
                  onPress={() => setPriority(p)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.priorityText, isActive && { color: config.color }]}>
                    {config.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Location</Text>

          <Text style={styles.label}>Store Name</Text>
          <TextInput
            style={styles.input}
            value={storeName}
            onChangeText={setStoreName}
            placeholder="Store name"
            placeholderTextColor="#9C9C90"
            editable={!isSubmitting}
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Street address"
            placeholderTextColor="#9C9C90"
            editable={!isSubmitting}
          />

          <View style={styles.row}>
            <View style={styles.flex2}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="City"
                placeholderTextColor="#9C9C90"
                editable={!isSubmitting}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.label}>State</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholder="TX"
                placeholderTextColor="#9C9C90"
                autoCapitalize="characters"
                maxLength={2}
                editable={!isSubmitting}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.label}>Zip</Text>
              <TextInput
                style={styles.input}
                value={zipCode}
                onChangeText={setZipCode}
                placeholder="75201"
                placeholderTextColor="#9C9C90"
                keyboardType="number-pad"
                maxLength={5}
                editable={!isSubmitting}
              />
            </View>
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!isOnline && <Text style={styles.offlineHint}>Editing requires an internet connection</Text>}
        <TouchableOpacity
          style={[styles.submitButton, (isSubmitting || !isOnline) && styles.submitButtonDisabled]}
          onPress={handleSave}
          disabled={isSubmitting || !isOnline}
          activeOpacity={0.7}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F3EE',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F3EE',
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
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9C9C90',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    color: '#6B6B60',
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E3DB',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#1C1C1A',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    minHeight: 100,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  priorityChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E3DB',
    backgroundColor: '#FAFAF6',
    alignItems: 'center',
  },
  priorityText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6B60',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  flex1: {
    flex: 1,
  },
  flex2: {
    flex: 2,
  },
  errorText: {
    color: '#C4432B',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 4,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#3C3A2E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  offlineHint: {
    color: '#C4432B',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
});
