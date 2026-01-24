/**
 * SettingsScreen
 * App settings and preferences
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Appbar, List, Divider, Switch, Text } from 'react-native-paper';
import { useSettingsStore } from '../stores/settingsStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export const SettingsScreen: React.FC<Props> = () => {
  const { settings, loadSettings, setThemeMode } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, []);

  const handleThemeChange = (mode: 'light' | 'dark' | 'auto') => {
    setThemeMode(mode);
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Instellingen" />
      </Appbar.Header>

      <ScrollView>
        {/* Appearance Section */}
        <List.Section>
          <List.Subheader>Weergave</List.Subheader>

          <List.Item
            title="Donker thema"
            description="Automatisch volgen van systeeminstelling"
            left={(props) => <List.Icon {...props} icon="brightness-6" />}
            right={() => (
              <Switch
                value={settings.themeMode === 'dark'}
                onValueChange={(value) =>
                  handleThemeChange(value ? 'dark' : 'light')
                }
              />
            )}
          />

          <Divider />
        </List.Section>

        {/* About Section */}
        <List.Section>
          <List.Subheader>Over</List.Subheader>

          <List.Item
            title="Versie"
            description="1.0.0"
            left={(props) => <List.Icon {...props} icon="information-outline" />}
          />

          <Divider />

          <List.Item
            title="Over deze app"
            description="SupermarktDeals verzamelt aanbiedingen van Nederlandse supermarkten"
            left={(props) => <List.Icon {...props} icon="help-circle-outline" />}
          />

          <Divider />
        </List.Section>

        {/* Legal Section */}
        <List.Section>
          <List.Subheader>Juridisch</List.Subheader>

          <List.Item
            title="Privacybeleid"
            left={(props) => <List.Icon {...props} icon="shield-check-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {
              // TODO: Open privacy policy
            }}
          />

          <Divider />

          <List.Item
            title="Gebruiksvoorwaarden"
            left={(props) => <List.Icon {...props} icon="file-document-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {
              // TODO: Open terms of service
            }}
          />

          <Divider />
        </List.Section>

        {/* Data Management */}
        <List.Section>
          <List.Subheader>Gegevens</List.Subheader>

          <List.Item
            title="Cache wissen"
            description="Verwijder lokale gegevens en afbeeldingen"
            left={(props) => <List.Icon {...props} icon="delete-outline" />}
            onPress={() => {
              // TODO: Clear cache
            }}
          />

          <Divider />
        </List.Section>

        {/* Footer */}
        <View style={styles.footer}>
          <Text variant="bodySmall" style={styles.footerText}>
            SupermarktDeals v1.0.0
          </Text>
          <Text variant="bodySmall" style={styles.footerText}>
            Gemaakt met Claude Code
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  footer: {
    padding: 32,
    alignItems: 'center',
  },
  footerText: {
    color: '#999',
    textAlign: 'center',
  },
});
