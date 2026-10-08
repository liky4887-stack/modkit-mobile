import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { getDb } from '../db/client';

export function VerificationAuditView() {
  const [verifications, setVerifications] = useState<any[]>([]);

  useEffect(() => {
    async function loadVerifications() {
      try {
        const db = await getDb();
        const rows = await db.getAllAsync('SELECT * FROM finding_verifications ORDER BY id DESC LIMIT 50;');
        setVerifications(rows);
      } catch (err) {
        console.error('Failed to load finding verifications:', err);
      }
    }
    loadVerifications();
  }, []);

  
  // [SHΔDØW CORE] Live Second-by-Second Telemetry Subscriber
  useEffect(() => {
    const interval = setInterval(() => {
      // Poll active pipeline telemetry ticks
    }, 1000);
    return () => clearInterval(interval);
  }, []);

return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Finding Verifications (v15)</Text>
      {verifications.length === 0 ? (
        <Text style={styles.empty}>No verifications recorded yet.</Text>
      ) : (
        verifications.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.title}>Proposal ID: {item.proposal_id || 'N/A'}</Text>
            <Text style={styles.text}>Status: {item.status || 'Pending'}</Text>
            <Text style={styles.details}>Details: {item.details || JSON.stringify(item)}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#0f172a' },
  header: { fontSize: 18, fontWeight: 'bold', color: '#38bdf8', marginBottom: 12 },
  empty: { color: '#94a3b8', fontStyle: 'italic' },
  card: { backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 8 },
  title: { color: '#f8fafc', fontWeight: 'bold', fontSize: 14 },
  text: { color: '#cbd5e1', fontSize: 12, marginTop: 4 },
  details: { color: '#94a3b8', fontSize: 10, marginTop: 4 },
});
