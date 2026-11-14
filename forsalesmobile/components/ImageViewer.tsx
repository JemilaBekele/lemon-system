import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveImageToGallery } from '@/(utils)/saveImage';

type ImageViewerProps = {
  uri?: string;
  title?: string;
  visible: boolean;
  onClose: () => void;
};

// Full-screen view of one image on a dark background; tap anywhere, the
// close button or Android back to dismiss. The download button saves it to
// the phone's gallery.
export default function ImageViewer({ uri, title, visible, onClose }: ImageViewerProps) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!uri || saving) return;
    setSaving(true);
    try {
      await saveImageToGallery(uri, title);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      visible={visible && !!uri}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.92)',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
        ) : null}
        {title ? (
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: '600',
              marginTop: 12,
              paddingHorizontal: 24,
              textAlign: 'center',
            }}
          >
            {title}
          </Text>
        ) : null}
        <View style={{ position: 'absolute', top: insets.top + 12, right: 16, flexDirection: 'row', gap: 12 }}>
          {uri ? (
            <Pressable
              onPress={handleSave}
              disabled={saving}
              hitSlop={12}
              accessibilityLabel="Download image"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="download-outline" size={22} color="#FFFFFF" />
              )}
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Close image"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
