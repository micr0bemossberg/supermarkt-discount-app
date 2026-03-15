/**
 * SettingsScreen
 * App settings and preferences
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { List, Divider, Switch, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../stores/settingsStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export const SettingsScreen: React.FC<Props> = () => {
  const insets = useSafeAreaInsets();
  const { settings, loadSettings, setThemeMode } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <View style={styles.container}>
      {/* Custom header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Instellingen</Text>
      </View>

      <ScrollView>
        {/* Appearance Section */}
        <List.Section>
          <List.Subheader style={styles.subheader}>Weergave</List.Subheader>

          <List.Item
            title="Donker thema"
            description="Schakelt tussen licht en donker thema"
            titleStyle={styles.listTitle}
            descriptionStyle={styles.listDescription}
            left={(props) => (
              <List.Icon {...props} icon="brightness-6" color="#1B5E20" />
            )}
            right={() => (
              <Switch
                value={settings.themeMode === 'dark'}
                onValueChange={(value) =>
                  setThemeMode(value ? 'dark' : 'light')
                }
                color="#1B5E20"
              />
            )}
          />

          <Divider style={styles.divider} />
        </List.Section>

        {/* About Section */}
        <List.Section>
          <List.Subheader style={styles.subheader}>Over</List.Subheader>

          <List.Item
            title="Versie"
            description="1.0.0"
            titleStyle={styles.listTitle}
            descriptionStyle={styles.listDescription}
            left={(props) => (
              <List.Icon {...props} icon="information-outline" color="#0D47A1" />
            )}
          />

          <Divider style={styles.divider} />

          <List.Item
            title="Over SupermarktDeals"
            description="Verzamelt aanbiedingen van Nederlandse supermarkten zodat je altijd de beste deals vindt."
            titleStyle={styles.listTitle}
            descriptionStyle={styles.listDescription}
            descriptionNumberOfLines={3}
            left={(props) => (
              <List.Icon {...props} icon="help-circle-outline" color="#0D47A1" />
            )}
          />

          <Divider style={styles.divider} />
        </List.Section>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="tag-multiple" size={28} color="#1B5E20" />
          </View>
          <Text style={styles.footerTitle}>SupermarktDeals</Text>
          <Text style={styles.footerVersion}>v1.0.0</Text>
          <Text style={styles.footerCredits}>Gemaakt met Claude Code</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
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
  subheader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#9E9E9E',
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212529',
  },
  listDescription: {
    fontSize: 13,
    color: '#757575',
  },
  divider: {
    marginLeft: 56,
  },
  footer: {
    padding: 40,
    alignItems: 'center',
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  footerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#424242',
    marginBottom: 4,
  },
  footerVersion: {
    fontSize: 13,
    color: '#9E9E9E',
    marginBottom: 4,
  },
  footerCredits: {
    fontSize: 12,
    color: '#BDBDBD',
  },
});
