import { ArrayOfObjectsInputProps, insert, setIfMissing, useFormValue, ArrayOfObjectsInputMembers } from 'sanity';
import { Card, Stack, TextInput, Box, Text, Button, Flex } from '@sanity/ui';
import { useCallback, useState } from 'react';
import { AddIcon, SyncIcon } from '@sanity/icons';

// Simple key generator since Sanity's internal randomKey isn't exported in the main bundle
const generateKey = () => Math.random().toString(36).substring(2, 10);

export function ChatEditor(props: ArrayOfObjectsInputProps) {
  const { onChange, readOnly, members, renderField, renderInput, renderItem, renderPreview } = props;
  const [inputText, setInputText] = useState('');

  // Get values for pre-filling and migration
  const defaultActor = useFormValue(['scriptActor']) as { _type: 'reference'; _ref: string } | undefined;
  const scriptValue = useFormValue(['script']) as string | undefined;

  const handleQuickAdd = useCallback(() => {
    const trimText = inputText.trim();
    if (trimText) {
      const newItem = {
        _key: generateKey(),
        _type: 'narrativeMessage',
        messageId: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        actor: defaultActor ? {
          _type: 'reference',
          _ref: defaultActor._ref
        } : undefined,
        text: trimText,
      };

      onChange([
        setIfMissing([]),
        insert([newItem], 'after', [-1])
      ]);
      
      setInputText('');
    }
  }, [inputText, onChange, defaultActor]);

  /**
   * Migration helper: Converts the plain-text 'script' field into
   * structured chat bubbles. Uses double newlines as block separators.
   */
  const handleImportFromScript = useCallback(() => {
    if (!scriptValue) return;
    
    // Split by double newlines to treat paragraphs as separate bubbles
    const blocks = scriptValue
      .split(/\n\s*\n/g)
      .map(block => block.trim())
      .filter(block => block.length > 0);
      
    const newItems = blocks.map(text => ({
      _key: generateKey(),
      _type: 'narrativeMessage',
      messageId: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      actor: defaultActor ? {
        _type: 'reference',
        _ref: defaultActor._ref
      } : undefined,
      text,
    }));

    if (newItems.length > 0) {
      onChange([
        setIfMissing([]),
        insert(newItems, 'after', [-1])
      ]);
    }
  }, [scriptValue, onChange, defaultActor]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleQuickAdd();
      }
    },
    [handleQuickAdd]
  );

  return (
    <Card border radius={3} style={{ overflow: 'hidden' }}>
      <Stack>
        {/* List of existing messages */}
        <Box padding={2} style={{ maxHeight: '600px', overflowY: 'auto' }}>
          {members.length === 0 ? (
            <Stack space={4} padding={4}>
              <Box style={{ textAlign: 'center' }}>
                <Text muted size={1}>
                  Noch keine strukturierten Nachrichten.
                </Text>
              </Box>
              
              {/* Migration Button helper */}
              {scriptValue && scriptValue.trim().length > 0 && (
                <Flex justify="center">
                  <Button
                    fontSize={1}
                    icon={SyncIcon}
                    mode="ghost"
                    text="Aus Skript-Feld importieren"
                    onClick={handleImportFromScript}
                  />
                </Flex>
              )}
            </Stack>
          ) : (
            <ArrayOfObjectsInputMembers
              members={members}
              renderField={renderField}
              renderInput={renderInput}
              renderItem={renderItem}
              renderPreview={renderPreview}
            />
          )}
        </Box>

        {/* Input box for new messages */}
        {!readOnly && (
          <Card borderTop padding={3} tone="transparent">
            <TextInput
              fontSize={2}
              icon={AddIcon}
              placeholder="Schnelle Nachricht + Enter (Nutzt Standard-Absender)..."
              value={inputText}
              onChange={(e) => setInputText(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
          </Card>
        )}
      </Stack>
    </Card>
  );
}
