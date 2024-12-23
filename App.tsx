import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { pick } from 'react-native-document-picker';
import { unzipFromContentUri } from './zip';
import RNFS from 'react-native-fs';
import { processEpubContent } from './epubParser';
import { useState } from 'react';
import HtmlToRNConverter from './HTMLToRNConverter';
import { 
  GestureHandlerRootView, 
  PanGestureHandler, 
  PanGestureHandlerGestureEvent 
} from 'react-native-gesture-handler';
import Icon from '@react-native-vector-icons/material-design-icons';
import TableOfContents from './TableOfContents';
import ProcessResult from './types/ProcessResult';
import { findContentOpf, findLongParagraph, getDirname } from './utils';
import { getLanguage } from './translation';
import { Language, languageToKeyMap } from './transcription';

const ReaderComponent = () => {
  const [processResult, setProcessResult] = useState<ProcessResult | undefined>(undefined);
  const [chapterIndex, setChapterIndex] = useState<number>(0);
  const [lastX, setLastX] = useState<number | null>(null);
  const [hasChangedChapter, setHasChangedChapter] = useState(false);
  const [tocVisible, setTocVisible] = useState(false);

  const handleGesture = (event: PanGestureHandlerGestureEvent) => {
    if (Math.abs(event.nativeEvent.velocityY) > Math.abs(event.nativeEvent.velocityX)) {
      return;
    }
    const VELOCITY_THRESHOLD = 500;
    const TRANSLATION_THRESHOLD = 150;
    const NEW_GESTURE_THRESHOLD = 75;

    if (lastX === null || Math.abs(event.nativeEvent.absoluteX - lastX) > NEW_GESTURE_THRESHOLD) {
      setHasChangedChapter(false);
      setLastX(event.nativeEvent.absoluteX);
    }
    
    if (!hasChangedChapter) {
      const meetsThreshold = 
        Math.abs(event.nativeEvent.velocityX) > VELOCITY_THRESHOLD && 
        Math.abs(event.nativeEvent.translationX) > TRANSLATION_THRESHOLD;
        
      if (meetsThreshold) {
        if (event.nativeEvent.translationX > 0 && chapterIndex > 0) {
          setChapterIndex(chapterIndex - 1);
          setHasChangedChapter(true);
        } else if (event.nativeEvent.translationX < 0 && chapterIndex < (processResult?.chapters?.length ?? 0) - 1) {
          setChapterIndex(chapterIndex + 1);
          setHasChangedChapter(true);
        }
      }
    }
  };

  const handleSelectBook = async (_e: any) => {
    try {
      const [result] = await pick({
        mode: 'open',
      });
      const unzipped = await unzipFromContentUri(result.uri);
      if (unzipped.outputPath) {
        const contentOpfPath = await findContentOpf(unzipped.outputPath);
        if (contentOpfPath) {
          const contents = await RNFS.readFile(contentOpfPath);
          const processResult: ProcessResult = await processEpubContent(contents, getDirname(contentOpfPath));
          if (processResult.success) {
            const excerpt = findLongParagraph(processResult.chapters![2].content);
            console.log(excerpt);
            if (!excerpt) {
              throw Error("Excerpt not found.");
            }
            const response = await getLanguage(excerpt);
            processResult.metadata!.language = languageToKeyMap.get(response.language as string);
            setProcessResult(processResult);
            setChapterIndex(0);
          }
        } else {
          console.error('content.opf not found in ', unzipped.outputPath);
        }
      }
    } catch (err) {
      console.error('Error opening file:', err);
    }
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.container}>
        <View style={styles.header}>
          { processResult?.chapters &&
            <Pressable onPress={() => setTocVisible(true)} style={styles.iconContainer}>
              <Icon name="format-list-bulleted" size={30} color="#000" />
            </Pressable>
          }
          <View style={{ flex: 1 }} />
          <Pressable onPress={handleSelectBook} style={styles.iconContainer}>
            <Icon name="book-open-variant" size={30} color="#000" />
          </Pressable>
        </View>
        <PanGestureHandler 
          onGestureEvent={handleGesture}
          activeOffsetX={[-20, 20]}
          failOffsetY={[-20, 20]}
        >
          <View style={styles.bookContainer}>
            { processResult && 
              processResult.chapters && 
              processResult.metadata?.language && 
                <HtmlToRNConverter 
                    html={processResult.chapters[chapterIndex].content} 
                    language={processResult.metadata.language as Language}
                />
            }
          </View>
        </PanGestureHandler>
        {processResult?.chapters && (
          <TableOfContents
            visible={tocVisible}
            onClose={() => setTocVisible(false)}
            chapters={processResult.chapters}
            onChapterPress={setChapterIndex}
            currentChapter={chapterIndex}
          />
        )}
      </View>
    </GestureHandlerRootView>
  );
};

const App = () => {
  return (
    <SafeAreaProvider>
      <ReaderComponent />
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bookContainer: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height - 50, // Adjust for button height
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  iconContainer: {
    padding: 10,
  },
});

export default App;

