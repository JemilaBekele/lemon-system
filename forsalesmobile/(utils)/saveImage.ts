import { Alert, Linking, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

// "Cheek Retractor (XX)" -> "cheek-retractor-xx"
const toFileBase = (name?: string) =>
  (name || 'product')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'product';

const extensionOf = (uri: string) =>
  uri.split('?')[0].match(/\.(png|jpe?g|webp|gif)$/i)?.[0].toLowerCase() || '.jpg';

// Download an image and save it to the phone's photo gallery.
// Returns true when it was saved.
export async function saveImageToGallery(uri: string, name?: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    // No gallery on web: open the image so the browser can save it
    await Linking.openURL(uri);
    return false;
  }

  try {
    // writeOnly: we only add photos, we never read the user's gallery
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow access to Photos in Settings to save product images.',
        permission.canAskAgain
          ? [{ text: 'OK' }]
          : [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
      );
      return false;
    }

    const target = new File(Paths.cache, `${toFileBase(name)}${extensionOf(uri)}`);
    if (target.exists) target.delete();
    const file = await File.downloadFileAsync(uri, target);

    await MediaLibrary.saveToLibraryAsync(file.uri);
    file.delete();

    Alert.alert('Saved', 'The image was saved to your gallery.');
    return true;
  } catch {
    Alert.alert('Download failed', 'Could not save the image. Check your connection and try again.');
    return false;
  }
}
