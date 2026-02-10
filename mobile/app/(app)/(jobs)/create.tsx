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
import { router } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import { useOffline } from '../../../contexts/OfflineContext';
import { createJob, assignJob, getVendors, getTechnicians } from '../../../services/jobs';
import { enqueueAction } from '../../../services/actionQueue';
import { PRIORITY_CONFIG } from '../../../constants/jobs';
import type { JobPriority } from '../../../types/job';
import type { Vendor, Technician } from '../../../services/jobs';

const PRIORITIES: JobPriority[] = ['low', 'medium', 'high', 'urgent'];

export default function CreateJobScreen() {
  const { user } = useAuth();
  const { isOnline, db } = useOffline();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<JobPriority>('medium');
  const [vendorId, setVendorId] = useState(user?.vendorId || '');
  const [storeName, setStoreName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Vendor & technician selection (admin only)
  const isAdmin = user?.role === 'admin';
  const isDispatcher = user?.role === 'dispatcher';
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingTechs, setLoadingTechs] = useState(false);

  // Fetch vendors for admin
  useEffect(() => {
    if (!isAdmin || !isOnline) return;
    setLoadingVendors(true);
    getVendors()
      .then((v) => {
        setVendors(v);
        if (v.length > 0 && !vendorId) {
          setVendorId(v[0].vendorId);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }, [isAdmin, isOnline]);

  // Fetch technicians when vendor changes (admin only)
  useEffect(() => {
    if (!isAdmin || !isOnline || !vendorId) {
      setTechnicians([]);
      setSelectedTechId(null);
      return;
    }
    setLoadingTechs(true);
    setSelectedTechId(null);
    getTechnicians(vendorId)
      .then(setTechnicians)
      .catch(() => setTechnicians([]))
      .finally(() => setLoadingTechs(false));
  }, [isAdmin, isOnline, vendorId]);

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!description.trim()) { setError('Description is required'); return; }
    if (!vendorId.trim()) { setError('Vendor is required'); return; }
    if (!storeName.trim() || !address.trim() || !city.trim() || !state.trim() || !zipCode.trim()) {
      setError('All location fields are required');
      return;
    }
    if (!/^\d{5}$/.test(zipCode.trim())) {
      setError('Zip code must be 5 digits');
      return;
    }

    setError('');
    setIsSubmitting(true);

    const jobData = {
      title: title.trim(),
      description: description.trim(),
      priority,
      vendorId: vendorId.trim(),
      location: {
        storeName: storeName.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        zipCode: zipCode.trim(),
      },
    };

    if (isOnline) {
      try {
        const { data: created } = await createJob(jobData);
        // If admin selected a technician, assign immediately
        if (isAdmin && selectedTechId && created.id) {
          try {
            await assignJob(created.id, selectedTechId);
          } catch {
            // Job created but assignment failed — not critical
          }
        }
        router.back();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create job');
        setIsSubmitting(false);
      }
    } else {
      enqueueAction(db, { actionType: 'CREATE_JOB', payload: jobData });
      Alert.alert('Saved Offline', 'Job will be created when you are back online.');
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {/* Title */}
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Job title"
            placeholderTextColor="#9C9C90"
            value={title}
            onChangeText={setTitle}
            editable={!isSubmitting}
          />

          {/* Description */}
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the work needed"
            placeholderTextColor="#9C9C90"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!isSubmitting}
          />

          {/* Priority */}
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

          {/* Vendor — dropdown for admin, locked for dispatcher */}
          <Text style={styles.label}>Vendor</Text>
          {isAdmin ? (
            loadingVendors ? (
              <ActivityIndicator size="small" style={{ marginVertical: 12 }} />
            ) : (
              <View style={styles.chipRow}>
                {vendors.map((v) => {
                  const isActive = vendorId === v.vendorId;
                  return (
                    <TouchableOpacity
                      key={v.vendorId}
                      style={[styles.vendorChip, isActive && styles.vendorChipActive]}
                      onPress={() => setVendorId(v.vendorId)}
                      activeOpacity={0.7}
                      disabled={isSubmitting}
                    >
                      <Text style={[styles.vendorChipText, isActive && styles.vendorChipTextActive]}>
                        {v.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          ) : (
            <TextInput
              style={[styles.input, isDispatcher && styles.inputDisabled]}
              placeholder="e.g. vendor-001"
              placeholderTextColor="#9C9C90"
              value={vendorId}
              onChangeText={setVendorId}
              editable={!isDispatcher && !isSubmitting}
              autoCapitalize="none"
            />
          )}

          {/* Technician — admin only, filtered by selected vendor */}
          {isAdmin && vendorId ? (
            <>
              <Text style={styles.label}>Assign Technician (optional)</Text>
              {loadingTechs ? (
                <ActivityIndicator size="small" style={{ marginVertical: 12 }} />
              ) : technicians.length === 0 ? (
                <Text style={styles.noTechText}>No technicians for this vendor</Text>
              ) : (
                <View style={styles.chipRow}>
                  {technicians.map((t) => {
                    const isActive = selectedTechId === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.techChip, isActive && styles.techChipActive]}
                        onPress={() => setSelectedTechId(isActive ? null : t.id)}
                        activeOpacity={0.7}
                        disabled={isSubmitting}
                      >
                        <Text style={[styles.techChipText, isActive && styles.techChipTextActive]}>
                          {t.displayName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          ) : null}
        </View>

        {/* Location */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Location</Text>

          <Text style={styles.label}>Store Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Store name"
            placeholderTextColor="#9C9C90"
            value={storeName}
            onChangeText={setStoreName}
            editable={!isSubmitting}
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Street address"
            placeholderTextColor="#9C9C90"
            value={address}
            onChangeText={setAddress}
            editable={!isSubmitting}
          />

          <View style={styles.row}>
            <View style={styles.flex2}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                placeholder="City"
                placeholderTextColor="#9C9C90"
                value={city}
                onChangeText={setCity}
                editable={!isSubmitting}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.label}>State</Text>
              <TextInput
                style={styles.input}
                placeholder="TX"
                placeholderTextColor="#9C9C90"
                value={state}
                onChangeText={setState}
                autoCapitalize="characters"
                maxLength={2}
                editable={!isSubmitting}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.label}>Zip</Text>
              <TextInput
                style={styles.input}
                placeholder="75201"
                placeholderTextColor="#9C9C90"
                value={zipCode}
                onChangeText={setZipCode}
                keyboardType="number-pad"
                maxLength={5}
                editable={!isSubmitting}
              />
            </View>
          </View>
        </View>

        {/* Error */}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.7}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Create Job</Text>
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
  inputDisabled: {
    backgroundColor: '#F0EFE9',
    color: '#9C9C90',
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  vendorChip: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E3DB',
    backgroundColor: '#FAFAF6',
  },
  vendorChipActive: {
    backgroundColor: '#3C3A2E',
    borderColor: '#3C3A2E',
  },
  vendorChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B6B60',
  },
  vendorChipTextActive: {
    color: '#FFFFFF',
  },
  techChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E3DB',
    backgroundColor: '#FAFAF6',
  },
  techChipActive: {
    backgroundColor: '#2D6A4F',
    borderColor: '#2D6A4F',
  },
  techChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6B60',
  },
  techChipTextActive: {
    color: '#FFFFFF',
  },
  noTechText: {
    fontSize: 13,
    color: '#9C9C90',
    fontStyle: 'italic',
    marginTop: 4,
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
});
