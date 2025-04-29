import {
  reactExtension,
  FunctionSettings,
  Text,
  Form,
  NumberField,
  Box,
  BlockStack,
  Card,
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

// Volume discount tiers for display
const VOLUME_DISCOUNTS = [
  { itemCount: 5, percentage: 30 },
  { itemCount: 4, percentage: 25 },
  { itemCount: 3, percentage: 20 },
  { itemCount: 2, percentage: 15 },
];

// Maximum additional tag-based discount
const MAX_TAG_DISCOUNT = 100;

// Maximum combined discount
const MAX_COMBINED_DISCOUNT = 100;

function VolumeDiscountInfo() {
  return (
    <Box padding="base">
      <BlockStack gap="base">
        <Text variant="headingMd">Volume Discounts (Automatic)</Text>
        <BlockStack gap="tight">
          {VOLUME_DISCOUNTS.map(({ itemCount, percentage }, index) => (
            <Text key={index}>• {itemCount}+ items: {percentage}% off</Text>
          ))}
        </BlockStack>
      </BlockStack>
    </Box>
  );
}

function TagDiscountField({ tag, percentage, onPercentageChange, onRemove }) {
  return (
    <Box padding="base">
      <InlineStack blockAlignment="center" inlineAlignment="space-between" gap="base">
        <TextField
          label="Tag"
          value={tag}
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
          accessibilityLabel={`Remove ${tag} tag`}
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
          const parsedConfig = JSON.parse(savedConfig);
          if (parsedConfig.tagDiscounts) {
            const loadedTags = Object.entries(parsedConfig.tagDiscounts).map(([key, value]) => ({
              tag: key.replace('Percentage', ''),
              percentage: value
            }));
            setTagDiscounts(loadedTags);
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
    if (selectedTag && !tagDiscounts.find(td => td.tag === selectedTag)) {
      setTagDiscounts([...tagDiscounts, { tag: selectedTag, percentage: 0 }]);
      setSelectedTag('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTagDiscounts(tagDiscounts.filter(td => td.tag !== tagToRemove));
  };

  const handlePercentageChange = (tag, newPercentage) => {
    if (newPercentage < 0 || newPercentage > MAX_TAG_DISCOUNT) {
      setError(`Tag discount percentage must be between 0 and ${MAX_TAG_DISCOUNT}`);
      return;
    }
    
    setTagDiscounts(tagDiscounts.map(td => 
      td.tag === tag ? { ...td, percentage: newPercentage } : td
    ));
    setError('');
  };

  const handleSave = async () => {
    try {
      const configuration = {
        tagDiscounts: tagDiscounts.reduce((acc, { tag, percentage }) => {
          acc[`${tag}Percentage`] = percentage;
          return acc;
        }, {})
      };

      await applyMetafieldChange({
        type: 'updateMetafield',
        namespace: 'awesome-discount',
        key: 'tag-discount-config',
        value: JSON.stringify(configuration),
        valueType: 'json',
      });
      setError('');
    } catch (error) {
      console.error('Error saving configuration:', error);
      setError('Failed to save configuration');
    }
  };

  const availableTagOptions = availableTags
    .filter(tag => !tagDiscounts.find(td => td.tag === tag))
    .map(tag => ({ label: tag, value: tag }));

  const totalTagDiscount = tagDiscounts.reduce((sum, td) => sum + td.percentage, 0);

  return (
    <FunctionSettings onSave={handleSave}>
      <Form>
        <BlockStack gap="base">
          {/* Volume Discount Section */}
          <Card>
            <VolumeDiscountInfo />
          </Card>

          {/* Tag-based Discount Section */}
          <Card>
            <BlockStack gap="base">
              <Box padding="base">
                <BlockStack gap="base">
                  <Text variant="headingMd">Additional Tag-Based Discounts</Text>
                  <Banner>
                    These discounts will be added on top of volume discounts.
                    Maximum additional discount per tag: {MAX_TAG_DISCOUNT}%
                  </Banner>

                  {error && (
                    <Banner tone="critical">{error}</Banner>
                  )}
                </BlockStack>
              </Box>

              {loading ? (
                <Box padding="base">
                  <InlineStack gap="base" align="center">
                    <ProgressIndicator />
                    <Text>Loading tags...</Text>
                  </InlineStack>
                </Box>
              ) : (
                <BlockStack gap="none">
                  {tagDiscounts.map(({ tag, percentage }) => (
                    <TagDiscountField
                      key={tag}
                      tag={tag}
                      percentage={percentage}
                      onPercentageChange={(newValue) => handlePercentageChange(tag, newValue)}
                      onRemove={() => handleRemoveTag(tag)}
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
          </Card>
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
            description: "Configuration for tag-based discount function"
          }
        ) {
          createdDefinition {
            id
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `);
    console.log('Create metafield response:', response);
    
    if (response.data?.metafieldDefinitionCreate?.userErrors?.length > 0) {
      console.error('Errors creating metafield definition:', response.data.metafieldDefinitionCreate.userErrors);
      return null;
    }
    
    return response.data?.metafieldDefinitionCreate?.createdDefinition;
  } catch (error) {
    console.error('Error creating metafield definition:', error);
    return null;
  }
}

function calculateCombinedDiscount(discounts) {
  if (discounts.length === 0) return 0;
  
  // Sort discounts in descending order
  const sortedDiscounts = [...discounts].sort((a, b) => b - a);
  
  // Calculate combined discount with diminishing returns
  let totalDiscount = 0;
  sortedDiscounts.forEach((discount, index) => {
    // First discount applies fully, subsequent discounts have diminishing effect
    const factor = Math.pow(0.5, index); // Each subsequent discount is half as effective
    totalDiscount += discount * factor;
  });

  // Cap at maximum allowed discount
  return Math.min(totalDiscount, MAX_COMBINED_DISCOUNT);
}
