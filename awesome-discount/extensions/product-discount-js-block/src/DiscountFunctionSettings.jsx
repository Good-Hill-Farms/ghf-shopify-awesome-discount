import {
  reactExtension,
  FunctionSettings,
  Text,
  Form,
  NumberField,
  Box,
  BlockStack,
  InlineStack,
  Button,
  Icon,
  useApi,
  TextField,
  ProgressIndicator,
  Select,
  Banner,
} from '@shopify/ui-extensions-react/admin';
import { useState, useEffect } from 'react';

// The target used here must match the target used in the extension toml file
const TARGET = 'admin.discount-details.function-settings.render';

// Default Buy X Get Y discount (used only for new discounts)
const DEFAULT_BUY_X_GET_Y = {
  buyQuantity: 2,
  getQuantity: 1,
  discountPercentage: 100, // 100% discount means free item
  enabled: true
};

// Maximum additional tag-based discount
const MAX_TAG_DISCOUNT = 100;

// Maximum discount percentage
const MAX_DISCOUNT_PERCENTAGE = 100;

function BuyXGetYDiscountManager({ buyXGetY, setBuyXGetY }) {
  const handleBuyQuantityChange = (newValue) => {
    setBuyXGetY({ ...buyXGetY, buyQuantity: newValue });
  };

  const handleGetQuantityChange = (newValue) => {
    setBuyXGetY({ ...buyXGetY, getQuantity: newValue });
  };

  const handleDiscountPercentageChange = (newValue) => {
    setBuyXGetY({ ...buyXGetY, discountPercentage: newValue });
  };

  const handleToggleEnabled = () => {
    setBuyXGetY({ ...buyXGetY, enabled: !buyXGetY.enabled });
  };

  return (
    <Box background="surface" border="base" borderRadius="base" padding="base">
      <BlockStack gap="base">
        <InlineStack blockAlignment="center" inlineAlignment="space-between">
          <Text variant="headingMd">Buy X Get Y Discount</Text>
          <Button
            variant={buyXGetY.enabled ? "primary" : "secondary"}
            onPress={handleToggleEnabled}
          >
            {buyXGetY.enabled ? "Enabled" : "Disabled"}
          </Button>
        </InlineStack>
        
        <Text>Configure your Buy X Get Y discount:</Text>
        
        <InlineStack blockAlignment="center" gap="base">
          <NumberField
            label="Buy Quantity (X)"
            value={buyXGetY.buyQuantity}
            onChange={handleBuyQuantityChange}
            min={1}
            disabled={!buyXGetY.enabled}
          />
          <NumberField
            label="Get Quantity (Y)"
            value={buyXGetY.getQuantity}
            onChange={handleGetQuantityChange}
            min={1}
            disabled={!buyXGetY.enabled}
          />
          <NumberField
            label="Discount %"
            value={buyXGetY.discountPercentage}
            onChange={handleDiscountPercentageChange}
            min={0}
            max={MAX_DISCOUNT_PERCENTAGE}
            suffix="%"
            disabled={!buyXGetY.enabled}
          />
        </InlineStack>
        
        <Banner tone="info">
          When customers buy {buyXGetY.buyQuantity} items, they'll get {buyXGetY.getQuantity} additional item(s) at {buyXGetY.discountPercentage}% off.
          {buyXGetY.discountPercentage === 100 && " (Free)"}
        </Banner>
      </BlockStack>
    </Box>
  );
}

function TagDiscountField({ tagId, tagName, percentage, onPercentageChange, onRemove }) {
  return (
    <Box padding="base">
      <InlineStack blockAlignment="center" inlineAlignment="space-between" gap="base">
        <TextField
          label="Tag"
          value={tagName}
          disabled
        />
        <NumberField
          label="Additional Discount %"
          value={percentage}
          onChange={onPercentageChange}
          suffix="%"
        />
        <Button
          variant="tertiary"
          onPress={onRemove}
          accessibilityLabel="Remove tag"
        >
          <Icon source="removeMajor" />
        </Button>
      </InlineStack>
    </Box>
  );
}

export default reactExtension(TARGET, () => <App />);

function App() {
  const { applyMetafieldChange, query, data } = useApi(TARGET);
  const [loading, setLoading] = useState(false);
  const [tagDiscounts, setTagDiscounts] = useState([]);
  const [nextTagId, setNextTagId] = useState(1);
  const [buyXGetY, setBuyXGetY] = useState({...DEFAULT_BUY_X_GET_Y});
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [error, setError] = useState('');

  // Load available tags from the store
  useEffect(() => {
    async function fetchTags() {
      setLoading(true);
      try {
        const response = await query(`
          query GetCustomerTags {
            customers(first: 100) {
              edges {
                node {
                  id
                  tags
                }
              }
            }
          }
        `);
        
        // Extract all tags from customers
        const allTags = response?.data?.customers?.edges?.reduce((acc, edge) => {
          if (!edge || !edge.node) return acc;
          const customerTags = edge.node.tags || [];
          return [...acc, ...customerTags];
        }, []) || [];
        
        // Remove duplicates and sort
        const uniqueTags = [...new Set(allTags)].sort();
        setAvailableTags(uniqueTags);
        setError('');
      } catch (error) {
        console.error('Error fetching tags:', error);
        setError('Failed to load customer tags');
        setAvailableTags([]);
      } finally {
        setLoading(false);
      }
    }

    fetchTags();
  }, [query]);

  // Load initial configuration
  useEffect(() => {
    async function loadInitialData() {
      if (!data?.discountNode?.id) return;

      try {
        const response = await query(`
          query GetMetafieldValue($id: ID!) {
            discountNode(id: $id) {
              id
              metafield(namespace: "awesome-discount", key: "tag-discount-config") {
                id
                value
              }
            }
          }
        `, {
          variables: { id: data.discountNode.id }
        });
        
        const savedConfig = response?.data?.discountNode?.metafield?.value;
        if (savedConfig) {
          try {
            const parsedConfig = JSON.parse(savedConfig);
            if (parsedConfig.tagDiscounts && typeof parsedConfig.tagDiscounts === 'object') {
              const loadedTags = [];
              let idCounter = 1;
              
              // Process tag discounts from the saved configuration
              Object.entries(parsedConfig.tagDiscounts).forEach(([tagName, percentage]) => {
                if (tagName) {
                  loadedTags.push({
                    id: idCounter++,
                    tagName: tagName,
                    percentage: Number(percentage) || 0
                  });
                }
              });
              
              setTagDiscounts(loadedTags);
              setNextTagId(idCounter); // Update the next ID counter
            }
            if (parsedConfig.buyXGetY) {
              setBuyXGetY(parsedConfig.buyXGetY);
            }
          } catch (parseError) {
            console.error('Error parsing saved configuration:', parseError);
            setError('Failed to parse saved configuration');
          }
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
        setError('Failed to load saved configuration');
      }
    }

    loadInitialData();
  }, [query, data?.discountNode?.id]);

  const handleAddTag = () => {
    if (selectedTag && !tagDiscounts.find(td => td.tagName === selectedTag)) {
      // Use numeric IDs instead of tag names as keys
      setTagDiscounts([...tagDiscounts, { 
        id: nextTagId,
        tagName: selectedTag, 
        percentage: 0 
      }]);
      setNextTagId(nextTagId + 1);
      setSelectedTag('');
    }
  };

  const handleRemoveTag = (tagId) => {
    setTagDiscounts(tagDiscounts.filter(td => td.id !== tagId));
  };

  const handlePercentageChange = (tagId, newPercentage) => {
    if (newPercentage < 0 || newPercentage > MAX_TAG_DISCOUNT) {
      setError(`Tag discount percentage must be between 0 and ${MAX_TAG_DISCOUNT}`);
      return;
    }
    
    setTagDiscounts(tagDiscounts.map(td => 
      td.id === tagId ? { ...td, percentage: newPercentage } : td
    ));
    setError('');
  };

  const handleSave = async () => {
    try {
      // Convert tag discounts to a simple object with tag names as keys
      const tagDiscountObject = {};
      
      // Process each tag discount
      tagDiscounts.forEach(item => {
        if (item && item.tagName) {
          // Store as tagName: percentage
          tagDiscountObject[item.tagName] = Number(item.percentage) || 0;
        }
      });
      
      const configuration = {
        buyXGetY: buyXGetY,
        tagDiscounts: tagDiscountObject
      };

      // Check if metafield definition exists
      const metafieldDefinition = await getMetafieldDefinition(query);
      if (!metafieldDefinition) {
        await createMetafieldDefinition(query);
      }

      // Save configuration to metafield
      await applyMetafieldChange({
        type: "updateMetafield",
        namespace: "awesome-discount",
        key: "tag-discount-config",
        valueType: "json",
        value: JSON.stringify(configuration),
      });

      return { status: "success" };
    } catch (error) {
      console.error('Error saving configuration:', error);
      setError('Failed to save configuration');
      return { status: "fail", errors: [{ message: 'Failed to save configuration' }] };
    }
  };

  const availableTagOptions = availableTags
    .filter(tag => !tagDiscounts.find(td => td.tagName === tag))
    .map(tag => ({ label: tag, value: tag }));

  const totalTagDiscount = tagDiscounts.reduce((sum, td) => sum + td.percentage, 0);

  return (
    <FunctionSettings onSave={handleSave}>
      <Form>
        <BlockStack gap="base">
          {/* Buy X Get Y Discount Section */}
          <BuyXGetYDiscountManager 
            buyXGetY={buyXGetY} 
            setBuyXGetY={setBuyXGetY} 
          />
        
          {/* Tag-based Discount Section */}
          <Box background="surface" border="base" borderRadius="base" padding="none">
            <BlockStack gap="base">
              <Box padding="base">
                <BlockStack gap="base">
                  <Text variant="headingMd">Additional Tag-Based Discounts</Text>
                  <Banner>
                    These discounts will be added on top of the Buy X Get Y discount.
                    Maximum additional discount per tag: {MAX_TAG_DISCOUNT}%
                  </Banner>
                  
                  {error && (
                    <Banner tone="critical">{error}</Banner>
                  )}
                </BlockStack>
              </Box>

              {loading ? (
                <Box padding="base">
                  <InlineStack gap="base">
                    <ProgressIndicator />
                    <Text>Loading tags...</Text>
                  </InlineStack>
                </Box>
              ) : (
                <BlockStack gap="none">
                  {tagDiscounts.map(({ id, tagName, percentage }) => (
                    <TagDiscountField
                      key={id}
                      tagId={id}
                      tagName={tagName}
                      percentage={percentage || 0}
                      onPercentageChange={(newValue) => handlePercentageChange(id, newValue)}
                      onRemove={() => handleRemoveTag(id)}
                    />
                  ))}

                  <Box padding="base">
                    <InlineStack blockAlignment="center" gap="base">
                      <Select
                        label="Select a tag"
                        options={availableTagOptions}
                        onChange={setSelectedTag}
                        value={selectedTag}
                        disabled={loading || availableTags.length === 0}
                      />
                      <Button 
                        onPress={handleAddTag} 
                        disabled={!selectedTag || loading}
                      >
                        Add Tag
                      </Button>
                    </InlineStack>
                  </Box>

                  {availableTags.length === 0 && !loading && !error && (
                    <Box padding="base">
                      <Text tone="subdued">No customer tags found. Add tags to customers to use them for discounts.</Text>
                    </Box>
                  )}

                  {tagDiscounts.length > 0 && (
                    <Box padding="base">
                      <Banner tone="info">
                        Total additional discount from tags: {totalTagDiscount}%
                      </Banner>
                    </Box>
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Box>
        </BlockStack>
      </Form>
    </FunctionSettings>
  );
}

async function getMetafieldDefinition(adminApiQuery) {
  try {
    const response = await adminApiQuery(`
      query GetMetafieldDefinition {
        metafieldDefinitions(first: 1, ownerType: DISCOUNT, namespace: "awesome-discount", key: "tag-discount-config") {
          nodes {
            id
          }
        }
      }
    `);
    const definition = response.data?.metafieldDefinitions?.nodes[0];
    console.log('Metafield definition:', definition);
    return definition;
  } catch (error) {
    console.error('Error getting metafield definition:', error);
    return null;
  }
}

async function createMetafieldDefinition(adminApiQuery) {
  try {
    const response = await adminApiQuery(`
      mutation CreateMetafieldDefinition {
        metafieldDefinitionCreate(
          definition: {
            name: "Tag Discount Configuration"
            key: "tag-discount-config"
            namespace: "awesome-discount"
            ownerType: DISCOUNT
            type: "json"
            description: "Configuration for tag-based discounts"
            pin: true
          }
        ) {
          createdDefinition {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `);
    
    const result = response.data?.metafieldDefinitionCreate;
    if (result?.userErrors?.length > 0) {
      console.error('Error creating metafield definition:', result.userErrors);
      return null;
    }
    
    console.log('Created metafield definition:', result?.createdDefinition);
    return result?.createdDefinition;
  } catch (error) {
    console.error('Error creating metafield definition:', error);
    return null;
  }
}
