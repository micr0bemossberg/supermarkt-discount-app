/**
 * GroceryListScreen
 * Weekly grocery list with categories, editable items, and shopping plan generation
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, SectionList, Alert, Pressable, Platform } from 'react-native';
import {
  Text,
  IconButton,
  FAB,
  Menu,
  Dialog,
  Portal,
  TextInput,
  Button,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
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
  const insets = useSafeAreaInsets();
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

  const uncheckedCount = items.filter((i) => !i.checked).length;
  const checkedCount = items.filter((i) => i.checked).length;

  const renderSectionHeader = ({ section }: { section: Section }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <View style={styles.sectionIconCircle}>
          <MaterialCommunityIcons
            name={section.icon as any}
            size={16}
            color="#1B5E20"
          />
        </View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>({section.data.length})</Text>
      </View>
      <IconButton
        icon="plus-circle-outline"
        size={20}
        iconColor="#1B5E20"
        onPress={() => openAddDialog(section.title)}
        style={styles.addButton}
      />
    </View>
  );

  const renderItem = ({ item }: { item: GroceryItem }) => (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        toggleChecked(item.id);
      }}
      style={[styles.itemRow, item.checked && styles.itemRowChecked]}
    >
      <MaterialCommunityIcons
        name={item.checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
        size={22}
        color={item.checked ? '#1B5E20' : '#BDBDBD'}
        style={styles.checkbox}
      />
      <Text
        style={[styles.itemName, item.checked && styles.itemNameChecked]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
      <View style={styles.quantityControls}>
        <Pressable
          onPress={() => {
            if (item.quantity > 1) {
              updateItem(item.id, { quantity: item.quantity - 1 });
            }
          }}
          style={styles.quantityBtn}
          disabled={item.quantity <= 1}
        >
          <MaterialCommunityIcons
            name="minus"
            size={14}
            color={item.quantity <= 1 ? '#E0E0E0' : '#616161'}
          />
        </Pressable>
        <Text style={styles.quantityText}>{item.quantity}</Text>
        <Pressable
          onPress={() => updateItem(item.id, { quantity: item.quantity + 1 })}
          style={styles.quantityBtn}
        >
          <MaterialCommunityIcons name="plus" size={14} color="#616161" />
        </Pressable>
      </View>
      <Pressable
        onPress={() => handleRemoveItem(item)}
        hitSlop={8}
        style={styles.deleteBtn}
      >
        <MaterialCommunityIcons name="close" size={16} color="#BDBDBD" />
      </Pressable>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {/* Custom header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.headerTitle}>Boodschappen</Text>
          <Text style={styles.headerSubtitle}>
            {uncheckedCount} nodig{checkedCount > 0 ? ` · ${checkedCount} gedaan` : ''}
          </Text>
        </View>
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon="dots-vertical"
              onPress={() => setMenuVisible(true)}
            />
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
      </View>

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
        label={`Winkelplan (${uncheckedCount})`}
        onPress={() => navigation.navigate('ShoppingPlan')}
        disabled={uncheckedCount === 0}
        color="#FFFFFF"
      />

      {/* Add Item Dialog */}
      <Portal>
        <Dialog visible={addDialogVisible} onDismiss={() => setAddDialogVisible(false)}>
          <Dialog.Title>Item toevoegen</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogCategory}>
              Categorie: {addCategory}
            </Text>
            <TextInput
              label="Productnaam"
              value={addName}
              onChangeText={setAddName}
              mode="outlined"
              autoFocus
              onSubmitEditing={handleAddItem}
              outlineColor="#E0E0E0"
              activeOutlineColor="#1B5E20"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddDialogVisible(false)} textColor="#757575">Annuleren</Button>
            <Button onPress={handleAddItem} disabled={!addName.trim()} textColor="#1B5E20">
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
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#212529',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 80,
  },
  sectionHeader: {
    backgroundColor: '#FFFFFF',
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginTop: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 14,
    color: '#212529',
  },
  sectionCount: {
    color: '#9E9E9E',
    marginLeft: 6,
    fontSize: 12,
  },
  addButton: {
    margin: 0,
  },
  itemRow: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  itemRowChecked: {
    backgroundColor: '#FAFAFA',
  },
  checkbox: {
    marginRight: 10,
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    color: '#212529',
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: '#BDBDBD',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  quantityBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#424242',
    minWidth: 20,
    textAlign: 'center',
  },
  deleteBtn: {
    marginLeft: 8,
    padding: 4,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#1B5E20',
    borderRadius: 28,
  },
  dialogCategory: {
    color: '#757575',
    marginBottom: 12,
    fontSize: 13,
  },
});
