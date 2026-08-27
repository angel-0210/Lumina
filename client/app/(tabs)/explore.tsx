import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store';
import { exploreApi, documentsApi, apiErrorMessage, ChatMessage, DocumentListItem } from '../../services/api';

interface LocalMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  sources?: string[] | null;
  isLoading?: boolean;
}

const LOADING_ID = '__loading__';

export default function ExploreScreen() {
  const accessToken = useAppStore((state) => state.accessToken);
  const sessionRestored = useAppStore((state) => state.sessionRestored);

  if (sessionRestored && !accessToken) {
    return <Redirect href="/signup" />;
  }

  if (!sessionRestored) {
    return (
      <View style={{ flex: 1, backgroundColor: '#131313', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#dfb7ff" />
      </View>
    );
  }

  // Explore (RAG chat) is a mobile-only feature.
  // On web, WebLayout has no Explore nav item — this route is never reached.
  if (Platform.OS === 'web') {
    return null;
  }

  return <MobileExploreScreen />;
}

function MobileExploreScreen() {
  const { docId } = useLocalSearchParams<{ docId?: string }>();
  const insets = useSafeAreaInsets();
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>(undefined);
  const [scopeLabel, setScopeLabel] = useState('All Documents');
  const [showScopePicker, setShowScopePicker] = useState(false);

  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Fetch user's completed documents for the scope picker.
  useEffect(() => {
    documentsApi.list(1, 50).then((res) => {
      const completed = res.items.filter((d) => d.status === 'completed');
      setDocuments(completed);
    }).catch(() => {});
  }, []);

  // Pre-select the document passed in route query parameters
  useEffect(() => {
    if (docId && documents.length > 0) {
      const doc = documents.find((d) => d.id === docId);
      if (doc) {
        setSelectedDocId(docId);
        setScopeLabel(doc.title);
        // Start fresh conversation when scope is preset from navigation
        setMessages([]);
        setSessionId(undefined);
      }
    }
  }, [docId, documents]);

  const handleSend = async () => {
    const query = inputText.trim();
    if (!query || sending) return;

    setInputText('');
    setSending(true);

    const userMsg: LocalMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: query,
    };
    const loadingMsg: LocalMessage = {
      id: LOADING_ID,
      sender: 'assistant',
      text: '',
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);

    try {
      const resp = await exploreApi.query(query, selectedDocId, sessionId);

      // Store the session ID from first turn.
      if (!sessionId) setSessionId(resp.sessionId);

      const assistantMsg: LocalMessage = {
        id: resp.message.id,
        sender: 'assistant',
        text: resp.message.text,
        sources: resp.message.sources,
      };

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== LOADING_ID),
        assistantMsg,
      ]);
    } catch (err) {
      const errText = apiErrorMessage(err, 'Failed to get a response. Please try again.');
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== LOADING_ID),
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ ${errText}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setSessionId(undefined);
    setInputText('');
  };

  const selectScope = (docId: string | undefined, label: string) => {
    setSelectedDocId(docId);
    setScopeLabel(label);
    setShowScopePicker(false);
    // Start fresh session when scope changes.
    setMessages([]);
    setSessionId(undefined);
  };

  const renderMessage = ({ item }: { item: LocalMessage }) => {
    if (item.isLoading) {
      return (
        <View style={[styles.messageBubble, styles.assistantBubble]}>
          <ActivityIndicator size="small" color="#991bf7" />
        </View>
      );
    }
    return (
      <View style={[
        styles.messageBubble,
        item.sender === 'user' ? styles.userBubble : styles.assistantBubble,
      ]}>
        <Text style={[
          styles.messageText,
          item.sender === 'user' ? styles.userText : styles.assistantText,
        ]}>
          {item.text}
        </Text>
        {item.sources && item.sources.length > 0 && (
          <View style={styles.sourcesContainer}>
            {item.sources.map((src, i) => (
              <View key={i} style={styles.sourceChip}>
                <Ionicons name="document-text-outline" size={11} color="#dfb7ff" />
                <Text style={styles.sourceText} numberOfLines={1}>{src}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const bottomMargin = isKeyboardVisible
    ? 0
    : insets.bottom + (Platform.OS === 'ios' ? 8 : 12) + 64 + 10;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ title: 'Explore Chat', headerShown: false }} />
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Explore</Text>
          <Text style={styles.screenSubtitle}>Ask questions, grounded in your documents</Text>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity onPress={handleNewConversation} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={22} color="#b8bdd4" />
          </TouchableOpacity>
        )}
      </View>

      {/* Scope Selector */}
      <TouchableOpacity
        style={styles.scopeSelector}
        onPress={() => setShowScopePicker(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="filter-outline" size={16} color="#dfb7ff" />
        <Text style={styles.scopeLabel}>{scopeLabel}</Text>
        <Ionicons name="chevron-down" size={14} color="#6e748a" />
      </TouchableOpacity>

      {/* Scope Picker Modal */}
      <Modal visible={showScopePicker} transparent animationType="fade" onRequestClose={() => setShowScopePicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowScopePicker(false)} activeOpacity={1}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Search Scope</Text>
            <TouchableOpacity
              style={[styles.scopeOption, !selectedDocId && styles.scopeOptionActive]}
              onPress={() => selectScope(undefined, 'All Documents')}
              activeOpacity={0.8}
            >
              <Ionicons name="library-outline" size={18} color={!selectedDocId ? '#dfb7ff' : '#6e748a'} />
              <Text style={[styles.scopeOptionText, !selectedDocId && styles.scopeOptionTextActive]}>All Documents</Text>
              {!selectedDocId && <Ionicons name="checkmark" size={16} color="#dfb7ff" />}
            </TouchableOpacity>
            <ScrollView style={styles.scopeList} showsVerticalScrollIndicator={false}>
              {documents.map((doc) => (
                <TouchableOpacity
                  key={doc.id}
                  style={[styles.scopeOption, selectedDocId === doc.id && styles.scopeOptionActive]}
                  onPress={() => selectScope(doc.id, doc.title)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={18}
                    color={selectedDocId === doc.id ? '#dfb7ff' : '#6e748a'}
                  />
                  <Text
                    style={[styles.scopeOptionText, selectedDocId === doc.id && styles.scopeOptionTextActive]}
                    numberOfLines={1}
                  >
                    {doc.title}
                  </Text>
                  {selectedDocId === doc.id && <Ionicons name="checkmark" size={16} color="#dfb7ff" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.welcomeContainer}>
            <View style={styles.welcomeIconWrapper}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color="#dfb7ff" />
            </View>
            <Text style={styles.welcomeTitle}>Ask Lumina Anything</Text>
            <Text style={styles.welcomeSubtitle}>
              Your answers will be grounded in your uploaded documents.
              {documents.length === 0 ? ' Upload a document to get started.' : ''}
            </Text>
            {/* Starter prompts */}
            {documents.length > 0 && (
              <View style={styles.starterContainer}>
                {[
                  'Summarize the key concepts',
                  'What are the main ideas?',
                  'Explain the core framework',
                ].map((prompt) => (
                  <TouchableOpacity
                    key={prompt}
                    style={styles.starterChip}
                    onPress={() => {
                      setInputText(prompt);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.starterText}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}

        {/* Input Bar */}
        <View style={[styles.inputRow, { marginBottom: bottomMargin }]}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask a question about your documents…"
            placeholderTextColor="rgba(209, 193, 215, 0.4)"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={4000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 10 : 10, marginBottom: 12,
  },
  screenTitle: { fontSize: 28, fontWeight: '700', color: '#f0f2f8' },
  screenSubtitle: { fontSize: 14, color: '#6e748a', marginTop: 4 },
  scopeSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: 'rgba(153, 27, 247, 0.05)', borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.2)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start',
  },
  scopeLabel: { fontSize: 13, color: '#dfb7ff', fontWeight: '500', maxWidth: 180 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#1a1a2a', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40, maxHeight: '60%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#f0f2f8', marginBottom: 16 },
  scopeList: { maxHeight: 300 },
  scopeOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(154, 140, 160, 0.06)',
  },
  scopeOptionActive: {},
  scopeOptionText: { flex: 1, fontSize: 14, color: '#a0a5c0' },
  scopeOptionTextActive: { color: '#dfb7ff', fontWeight: '500' },
  chatArea: { flex: 1 },
  messageList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 12 },
  messageBubble: {
    maxWidth: '85%', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12,
  },
  userBubble: {
    alignSelf: 'flex-end', backgroundColor: 'rgba(153, 27, 247, 0.18)',
    borderWidth: 1, borderColor: 'rgba(153, 27, 247, 0.25)',
  },
  assistantBubble: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(20, 20, 35, 0.8)',
    borderWidth: 1, borderColor: 'rgba(154, 140, 160, 0.1)',
  },
  messageText: { fontSize: 14, lineHeight: 22 },
  userText: { color: '#f0f2f8' },
  assistantText: { color: '#d1c1d7' },
  sourcesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  sourceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(153, 27, 247, 0.08)', borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.2)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4, maxWidth: 180,
  },
  sourceText: { fontSize: 10, color: '#dfb7ff' },
  welcomeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  welcomeIconWrapper: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: 'rgba(153, 27, 247, 0.08)', borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.15)', justifyContent: 'center',
    alignItems: 'center', marginBottom: 20,
  },
  welcomeTitle: { fontSize: 20, fontWeight: '700', color: '#f0f2f8', marginBottom: 8, textAlign: 'center' },
  welcomeSubtitle: { fontSize: 14, color: '#6e748a', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  starterContainer: { gap: 8, alignItems: 'center', width: '100%' },
  starterChip: {
    backgroundColor: 'rgba(20, 20, 20, 0.4)', borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10, width: '100%',
  },
  starterText: { fontSize: 13, color: '#a0a5c0', textAlign: 'center' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(154, 140, 160, 0.08)',
    backgroundColor: '#0d1117',
  },
  textInput: {
    flex: 1, backgroundColor: 'rgba(20, 20, 20, 0.4)', borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.12)', borderRadius: 14, color: '#f0f2f8',
    fontSize: 14, paddingHorizontal: 14, paddingVertical: 12,
    maxHeight: 120, minHeight: 44,
  },
  sendButton: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#991bf7',
    justifyContent: 'center', alignItems: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#3a1a55', opacity: 0.5 },
});
