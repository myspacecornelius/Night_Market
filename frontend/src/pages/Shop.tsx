import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Send } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const Shop = () => {
  const [productUrl, setProductUrl] = useState('');
  const [variantId, setVariantId] = useState('');
  const [size, setSize] = useState('');
  const [retailer, setRetailer] = useState('shopify');
  const [mode, setMode] = useState('request');
  const [profileId, setProfileId] = useState('');
  const [cost, setCost] = useState(100); // Example cost

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.info("Submitting purchase request...");
    // TODO: Implement API call to purchase-checkout-task
    console.log({
      productUrl,
      variantId,
      size,
      retailer,
      mode,
      profileId,
      cost
    });
  };

  return (
    <motion.div
      className="space-y-8 p-6 min-h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="flex items-center justify-between"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="text-4xl font-bold text-gray-800 dark:text-white">Checkout Shop</h1>
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-8 h-8 text-gray-500" />
          <span className="text-lg font-semibold">Purchase a Checkout Task</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>New Checkout Task</CardTitle>
            <CardDescription>Use your LACES to purchase a checkout task. The cost will be deducted from your balance.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="productUrl">Product URL</Label>
                  <Input id="productUrl" value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="https://kith.com/products/..." required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="variantId">Variant ID</Label>
                  <Input id="variantId" value={variantId} onChange={(e) => setVariantId(e.target.value)} placeholder="123456789" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="size">Size</Label>
                  <Input id="size" value={size} onChange={(e) => setSize(e.target.value)} placeholder="10.5" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retailer">Retailer</Label>
                  <Input id="retailer" value={retailer} onChange={(e) => setRetailer(e.target.value)} placeholder="shopify" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mode">Mode</Label>
                  <Input id="mode" value={mode} onChange={(e) => setMode(e.target.value)} placeholder="request" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profileId">Profile ID</Label>
                  <Input id="profileId" value={profileId} onChange={(e) => setProfileId(e.target.value)} placeholder="your-profile-id" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Cost (LACES)</Label>
                <Input id="cost" type="number" value={cost} onChange={(e) => setCost(parseInt(e.target.value))} required />
              </div>
              <div className="flex justify-end">
                <Button type="submit" className="flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  Purchase Task
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

export default Shop;
