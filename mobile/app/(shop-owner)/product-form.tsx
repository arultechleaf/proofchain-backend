import React, { useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { ProductImage } from '../../src/components/ProductCard';
import { Button, Card, Chip, ErrorBanner, SectionTitle, TextField } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { ownerService, uploadPhoto } from '../../src/services/owner.service';
import { useEditingProduct } from '../../src/store/editing.store';
import { colors, font, spacing } from '../../src/theme';
import { errorText } from '../../src/utils/format';
import type { Pack, ProductInput } from '../../src/types';

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const UNITS = ['kg', 'gram', 'litre', 'ml', 'piece', 'packet'];

interface PackRow { label: string; qty: string; price: string }

/** The usual pack sizes for a unit, so the owner only has to check the prices. */
const suggestPacks = (unit: string, price: number): PackRow[] => {
  const sizes: Array<[string, number]> | null =
    unit === 'kg' ? [['250 g', 0.25], ['500 g', 0.5], ['1 kg', 1]]
      : unit === 'litre' ? [['250 ml', 0.25], ['500 ml', 0.5], ['1 L', 1]]
        : null;
  if (!sizes) return [];
  return sizes.map(([label, qty]) => ({ label, qty: String(qty), price: String(Math.round(price * qty)) }));
};

export default function ProductForm() {
  const router = useRouter();
  const editing = useEditingProduct((s) => s.product);
  const setEditing = useEditingProduct((s) => s.set);
  const cats = useApi(() => ownerService.categories(), []);

  const [name, setName] = useState(editing?.name ?? '');
  const [nameTa, setNameTa] = useState(editing?.nameTa ?? '');
  const [brand, setBrand] = useState(editing?.brand ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [unit, setUnit] = useState(editing?.unit ?? 'kg');
  const [mrp, setMrp] = useState(editing ? String(editing.mrp) : '');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [purchase, setPurchase] = useState(editing?.purchasePrice != null ? String(editing.purchasePrice) : '');
  const [packs, setPacks] = useState<PackRow[]>((editing?.packs ?? []).map((p: Pack) => ({ label: p.label, qty: String(p.qty), price: String(p.price) })));
  const [stock, setStock] = useState(editing ? String(editing.stock) : '0');
  const [low, setLow] = useState(editing?.lowStockLevel !== undefined ? String(editing.lowStockLevel) : '5');
  const [expiry, setExpiry] = useState(editing?.expiryDate ? String(editing.expiryDate).slice(0, 10) : '');
  const [barcode, setBarcode] = useState(editing?.barcode ?? '');
  const [imageUrl, setImageUrl] = useState(editing?.imageUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [categoryId, setCategoryId] = useState<number | undefined>(editing?.categoryId ?? undefined);
  const [active, setActive] = useState(editing?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const upRow = (i: number, k: keyof PackRow) => (v: string) => setPacks((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const sendPhoto = async (res: ImagePicker.ImagePickerResult) => {
    const asset = res.canceled ? undefined : res.assets?.[0];
    if (!asset) return;
    setUploading(true); setProblem('');
    try { setImageUrl(await uploadPhoto(asset.uri, asset.mimeType)); }
    catch (err) { setProblem(errorText(err, 'Could not upload the photo')); }
    finally { setUploading(false); }
  };
  const fromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Photos', 'Allow photo access in the phone settings to pick a picture.');
    await sendPhoto(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 }));
  };
  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Camera', 'Allow camera access in the phone settings to take a picture.');
    await sendPhoto(await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6 }));
  };

  const fillPacks = () => {
    const p = num(price);
    if (p === undefined || Number.isNaN(p)) return setProblem('Enter the common price first');
    const rows = suggestPacks(unit, p);
    if (!rows.length) return setProblem('Automatic pack sizes are for kg and litre. Add the pack sizes by hand.');
    setProblem('');
    setPacks(rows);
  };

  const save = async () => {
    if (name.trim().length < 2) return setProblem('Enter the product name');
    const p = num(price); const m = num(mrp) ?? p;
    if (p === undefined || Number.isNaN(p) || p < 0) return setProblem(`Enter the common price (per ${unit})`);
    if (m === undefined || Number.isNaN(m) || m < p) return setProblem('MRP cannot be less than the common price');
    const buy = num(purchase);
    if (buy !== undefined && (Number.isNaN(buy) || buy < 0)) return setProblem('Enter a valid purchase price');
    if (expiry.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(expiry.trim())) return setProblem('Write the expiry date like 2026-12-31');

    const parsed: Pack[] = [];
    for (const r of packs) {
      const q = Number(r.qty); const pr = Number(r.price);
      if (!r.label.trim() || !(q > 0) || Number.isNaN(pr) || pr < 0) return setProblem('Each pack needs a name, an amount and a price');
      parsed.push({ label: r.label.trim(), qty: q, price: pr });
    }
    if (new Set(parsed.map((x) => x.label.toLowerCase())).size !== parsed.length) return setProblem('Two packs have the same name');

    const input: ProductInput = {
      name: name.trim(), nameTa: nameTa.trim() || undefined, categoryId, brand: brand.trim() || undefined,
      description: description.trim() || undefined, unit, mrp: m, price: p, purchasePrice: buy, packs: parsed,
      stock: num(stock) ?? 0, lowStockLevel: num(low) ?? 5, expiryDate: expiry.trim() || undefined, barcode: barcode.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined, isActive: active,
    };
    setBusy(true); setProblem('');
    try {
      if (editing) await ownerService.updateProduct(editing.id, input); else await ownerService.createProduct(input);
      setEditing(null);
      router.back();
    } catch (err) { setProblem(errorText(err, 'Could not save the product')); } finally { setBusy(false); }
  };

  return (
    <Screen back title={editing ? 'Edit product' : 'New product'}
      footer={<Button title={editing ? 'Save changes' : 'Add product'} onPress={save} loading={busy} disabled={uploading} />}>
      <ErrorBanner message={problem} />

      <SectionTitle title="Photo" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
        <ProductImage uri={imageUrl || null} size={96} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Button small variant="outline" icon="images-outline" title="Choose from gallery" onPress={fromGallery} loading={uploading} />
          <Button small variant="outline" icon="camera-outline" title="Take a photo" onPress={fromCamera} disabled={uploading} />
          {imageUrl ? <Button small variant="ghost" title="Remove photo" onPress={() => setImageUrl('')} /> : null}
        </View>
      </View>

      <TextField label="Name (English)" value={name} onChangeText={setName} placeholder="Ponni rice" />
      <TextField label="Name (தமிழ்)" value={nameTa} onChangeText={setNameTa} placeholder="பொன்னி அரிசி" />
      <TextField label="Brand (optional)" value={brand} onChangeText={setBrand} />
      <Text style={{ fontSize: font.sm, fontWeight: '600', color: colors.text, marginBottom: 6 }}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg, flexGrow: 0 }}>
        <Chip label="None" active={categoryId === undefined} onPress={() => setCategoryId(undefined)} />
        {(cats.data ?? []).map((c) => <Chip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />)}
      </ScrollView>

      <Text style={{ fontSize: font.sm, fontWeight: '600', color: colors.text, marginBottom: 6 }}>Unit</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg, flexGrow: 0 }}>
        {UNITS.map((u) => <Chip key={u} label={u} active={unit === u} onPress={() => setUnit(u)} />)}
      </ScrollView>

      <SectionTitle title="Common price" />
      <Text style={{ color: colors.textMuted, fontSize: font.sm, marginBottom: spacing.sm }}>The price of one whole {unit}. Customers see it as “₹ / {unit}”.</Text>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}><TextField label={`Common price (₹ / ${unit})`} value={price} onChangeText={setPrice} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><TextField label="MRP (₹)" value={mrp} onChangeText={setMrp} keyboardType="decimal-pad" placeholder="Same as price" /></View>
      </View>
      <TextField label="Purchase price (₹, only you can see this)" value={purchase} onChangeText={setPurchase} keyboardType="decimal-pad" />

      <SectionTitle title="Pack-wise prices" />
      <Text style={{ color: colors.textMuted, fontSize: font.sm, marginBottom: spacing.sm }}>
        Optional. Sell it in packs such as 250 g, 500 g and 1 kg, each with its own price. “Amount” is how many {unit} one pack holds (0.5 for 500 g).
      </Text>
      {packs.map((r, i) => (
        <Card key={i} style={{ marginBottom: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1.2 }}><TextField label="Pack name" value={r.label} onChangeText={upRow(i, 'label')} placeholder="500 g" /></View>
            <View style={{ flex: 1 }}><TextField label={`Amount (${unit})`} value={r.qty} onChangeText={upRow(i, 'qty')} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><TextField label="Price (₹)" value={r.price} onChangeText={upRow(i, 'price')} keyboardType="decimal-pad" /></View>
          </View>
          <Button small variant="ghost" icon="trash-outline" title="Remove this pack" onPress={() => setPacks((rows) => rows.filter((_, j) => j !== i))} />
        </Card>
      ))}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' }}>
        <Button small variant="outline" icon="add" title="Add a pack" onPress={() => setPacks((rows) => [...rows, { label: '', qty: '', price: '' }])} />
        <Button small variant="outline" icon="flash-outline" title="Fill from common price" onPress={fillPacks} />
      </View>

      <SectionTitle title="Stock" />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}><TextField label={`Stock (${unit})`} value={stock} onChangeText={(v) => setStock(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><TextField label="Low-stock alert at" value={low} onChangeText={(v) => setLow(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" /></View>
      </View>
      <TextField label="Expiry date (optional)" value={expiry} onChangeText={setExpiry} placeholder="2026-12-31" keyboardType="numbers-and-punctuation" maxLength={10} />
      <TextField label="Barcode (optional)" value={barcode} onChangeText={setBarcode} keyboardType="number-pad" maxLength={40} />

      <TextField label="Description (optional)" value={description} onChangeText={setDescription} multiline />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: font.md, color: colors.text }}>Show to customers (active)</Text>
        <Switch value={active} onValueChange={setActive} trackColor={{ true: colors.primary }} />
      </View>
    </Screen>
  );
}
