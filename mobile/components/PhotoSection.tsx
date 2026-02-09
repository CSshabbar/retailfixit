import { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';
import type { Attachment } from '../types/job';

interface PhotoSectionProps {
  jobId: string;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  canEdit: boolean;
}

export default function PhotoSection({
  jobId,
  attachments,
  onAttachmentsChange,
  canEdit,
}: PhotoSectionProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const pickImage = async (useCamera: boolean) => {
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to take photos.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Photo library access is required.');
        return;
      }
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: false,
        });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/jpeg';

    setIsUploading(true);
    try {
      const { data } = await api.uploadFile<{ data: Attachment }>(
        `/api/jobs/${jobId}/attachments`,
        asset.uri,
        'photo',
        mimeType,
      );
      onAttachmentsChange([...attachments, data.data]);
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Could not upload photo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (attachment: Attachment) => {
    Alert.alert('Delete Photo', 'Are you sure you want to delete this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(attachment.id);
          try {
            await api.delete(`/api/jobs/${jobId}/attachments/${attachment.id}`);
            onAttachmentsChange(attachments.filter((a) => a.id !== attachment.id));
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Could not delete photo');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  const showAddOptions = () => {
    Alert.alert('Add Photo', 'Choose source', [
      { text: 'Camera', onPress: () => pickImage(true) },
      { text: 'Photo Library', onPress: () => pickImage(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>
          Photos{attachments.length > 0 ? ` (${attachments.length})` : ''}
        </Text>
        {canEdit && (
          <TouchableOpacity
            style={[styles.addButton, isUploading && styles.buttonDisabled]}
            onPress={showAddOptions}
            disabled={isUploading}
            activeOpacity={0.7}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#3C3A2E" />
            ) : (
              <Text style={styles.addButtonText}>+ Add</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {attachments.length === 0 ? (
        <Text style={styles.emptyText}>No photos attached</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery}>
          {attachments.map((att) => (
            <View key={att.id} style={styles.photoCard}>
              {att.sasUrl ? (
                <Image
                  source={{ uri: att.sasUrl }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Text style={styles.placeholderText}>No preview</Text>
                </View>
              )}
              {canEdit && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(att)}
                  disabled={deletingId === att.id}
                  activeOpacity={0.7}
                >
                  {deletingId === att.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.deleteIcon}>X</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9C9C90',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  addButton: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3C3A2E',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#3C3A2E',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: '#9C9C90',
    textAlign: 'center',
    paddingVertical: 20,
  },
  gallery: {
    flexDirection: 'row',
  },
  photoCard: {
    marginRight: 10,
    width: 120,
    position: 'relative',
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 10,
    backgroundColor: '#F0EFE9',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 11,
    color: '#9C9C90',
  },
  deleteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(196,67,43,0.85)',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIcon: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
