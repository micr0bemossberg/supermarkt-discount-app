/**
 * GroceryListScreen
 * Weekly grocery list with categories, editable items, and shopping plan generation
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, SectionList, Alert } from 'react-native';
import {
  Appbar,
  Text,
  IconButton,
  FAB,
  Chip,
  Menu,
  Dialog,
  Portal,
  TextInput,
  Button,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGroceryListStore, GROCERY_CATEGORIES, type GroceryItem } from '../stores/groceryListStore';
import { EmptyState } from '../components/EmptyState';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';

interface Section {
  title: string;
  icon: string;
  data: GroceryItem[];
}

export const GroceryListScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { items, loading, loadList, addItem, removeItem, updateItem, toggleChecked, resetToTemplate, uncheckAll } = useGroceryListStore();

  const [menuVisible, setMenuVisible] = useState(false);
  const [addDialogVisible, setAddDialogVisible] = useState(false);
  const [addCategory, setAddCategory] = useState('');
  const [addName, setAddName] = useState('');

  useEffect(() => {
    loadList();
  }, []);

  // Group items by category
  const sections: Section[] = React.useMemo(() => {
    const grouped: Record<string, GroceryItem[]> = {};
    for (const item of items) {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    }

    return GROCERY_CATEGORIES
      .filter((cat) => grouped[cat.name])
      .map((cat) => ({
        title: cat.name,
        icon: cat.icon,
        data: grouped[cat.name],
      }));
  }, [items]);

  const handleAddItem = useCallback(() => {
    if (addName.trim() && addCategory) {
      addItem(addName.trim(), addCategory);
      setAddName('');
      setAddDialogVisible(false);
    }
  }, [addName, addCategory, addItem]);

  const handleRemoveItem = useCallback((item: GroceryItem) => {
    Alert.alert(
      'Verwijderen',
      `${item.name} verwijderen van de lijst?`,
      [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Verwijderen', style: 'destructive', onPress: () => removeItem(item.id) },
      ]
    );
  }, [removeItem]);

  const handleResetList = useCallback(() => {
    Alert.alert(
      'Lijst resetten',
      'Wil je de boodschappenlijst terugzetten naar de standaard?',
      [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Resetten', onPress: () => resetToTemplate() },
      ]
    );
  }, [resetToTemplate]);

  const openAddDialog = useCallback((category: string) => {
    setAddCategory(category);
    setAddName('');
    setAddDialogVisible(true);
  }, []);

  const renderSectionHeader = ({ section }: { section: Section }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <MaterialCommunityIcons
          name={section.icon as any}
          size={20}
          color="#0066CC"
          style={styles.sectionIcon}
        />
        <Text variant="titleSmall" style={styles.sectionTitle}>
          {section.title}
        </Text>
        <Text variant="bodySmall" style={styles.sectionCount}>
          ({section.data.length})
        </Text>
      </View>
      <IconButton
        icon="plus"
        size={18}
        onPress={() => openAddDialog(section.title)}
      />
    </View>
  );

  const renderItem = ({ item }: { item: GroceryItem }) => (
    <View style={[styles.itemRow, item.checked && styles.itemRowChecked]}>
      <IconButton
        icon={item.checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
        size={22}
        iconColor={item.checked ? '#00A86B' : '#999'}
        onPress={() => toggleChecked(item.id)}
        style={styles.checkbox}
      />
      <View style={styles.itemInfo}>
        <Text
          variant="bodyMedium"
          style={[styles.itemName, item.checked && styles.itemNameChecked]}
        >
          {item.name}
        </Text>
      </View>
      <View style={styles.quantityControls}>
        <IconButton
          icon="minus"
          size={16}
          onPress={() => {
            if (item.quantity > 1) {
              updateItem(item.id, { quantity: item.quantity - 1 });
            }
          }}
          disabled={item.quantity <= 1}
          style={styles.quantityButton}
        />
        <Chip compact style={styles.quantityChip} textStyle={styles.quantityText}>
          {item.quantity}
        </Chip>
        <IconButton
          icon="plus"
          size={16}
          onPress={() => updateItem(item.id, { quantity: item.quantity + 1 })}
          style={styles.quantityButton}
        />
      </View>
      <IconButton
        icon="delete-outline"
        size={18}
        iconColor="#E74C3C"
        onPress={() => handleRemoveItem(item)}
        style={styles.deleteButton}
      />
    </View>
  );

  const uncheckedCount = items.filter((i) => !i.checked).length;

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Boodschappenlijst" />
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <Appbar.Action icon="dots-vertical" onPress={() => setMenuVisible(true)} />
          }
        >
          <Menu.Item
            onPress={() => { uncheckAll(); setMenuVisible(false); }}
            title="Alles demarkeren"
            leadingIcon="checkbox-blank-circle-outline"
          />
          <Menu.Item
            onPress={() => { handleResetList(); setMenuVisible(false); }}
            title="Lijst resetten"
            leadingIcon="restore"
          />
        </Menu>
      </Appbar.Header>

      {items.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title="Geen boodschappen"
          message="Je boodschappenlijst is leeg. Voeg items toe of reset naar de standaardlijst."
          actionLabel="Standaardlijst laden"
          onAction={resetToTemplate}
        />
      ) : (
        <SectionList
          sections={sections}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled
        />
      )}

      <FAB
        style={styles.fab}
        icon="cart-check"
        label={`Maak winkelplan (${uncheckedCount})`}
        onPress={() => navigation.navigate('ShoppingPlan')}
        disabled={uncheckedCount === 0}
      />

      {/* Add Item Dialog */}
      <Portal>
        <Dialog visible={addDialogVisible} onDismiss={() => setAddDialogVisible(false)}>
          <Dialog.Title>Item toevoegen</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={styles.dialogCategory}>
              Categorie: {addCategory}
            </Text>
            <TextInput
              label="Productnaam"
              value={addName}
              onChangeText={setAddName}
              mode="outlined"
              autoFocus
              onSubmitEditing={handleAddItem}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddDialogVisible(false)}>Annuleren</Button>
            <Button onPress={handleAddItem} disabled={!addName.trim()}>
              Toevoegen
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    paddingBottom: 80,
  },
  sectionHeader: {
    backgroundColor: '#fff',
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIcon: {
    marginRight: 8,
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  sectionCount: {
    color: '#666',
    marginLeft: 6,
  },
  itemRow: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  itemRowChecked: {
    backgroundColor: '#f9f9f9',
  },
  checkbox: {
    margin: 0,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    margin: 0,
  },
  quantityChip: {
    minWidth: 28,
    height: 26,
  },
  quantityText: {
    fontSize: 13,
  },
  deleteButton: {
    margin: 0,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#0066CC',
  },
  dialogCategory: {
    color: '#666',
    marginBottom: 12,
  },
});
