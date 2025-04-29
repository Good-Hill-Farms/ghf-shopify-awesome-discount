// @ts-check
import { DiscountApplicationStrategy } from "../generated/api";

// Use JSDoc annotations for type safety
/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 * @typedef {import("../generated/api").Target} Target
 * @typedef {import("../generated/api").ProductVariant} ProductVariant
 */

/**
 * @type {FunctionRunResult}
 */
const EMPTY_DISCOUNT = {
  discountApplicationStrategy: DiscountApplicationStrategy.All,
  discounts: [],
};

// Maximum combined discount percentage allowed
const MAX_COMBINED_DISCOUNT = 50;

// Volume discount tiers
const VOLUME_DISCOUNTS = [
  { itemCount: 5, percentage: 30 },
  { itemCount: 4, percentage: 25 },
  { itemCount: 3, percentage: 20 },
  { itemCount: 2, percentage: 15 },
];

/**
 * Calculate volume-based discount based on item count
 * @param {number} itemCount Total number of items in cart
 * @returns {number} Applicable volume discount percentage
 */
function calculateVolumeDiscount(itemCount) {
  const applicableTier = VOLUME_DISCOUNTS.find(tier => itemCount >= tier.itemCount);
  return applicableTier ? applicableTier.percentage : 0;
}

/**
 * Calculate the effective combined discount
 * @param {number[]} discounts Array of discount percentages
 * @returns {number} Combined discount percentage
 */
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

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  console.log('Running discount function with input:', JSON.stringify(input, null, 2));

  // Parse the configuration from metafield
  const configuration = JSON.parse(
    input?.discountNode?.metafield?.value ?? '{"tagDiscounts":{}}'
  );

  console.log('Parsed configuration:', configuration);

  // Calculate total items in cart
  const totalItems = input.cart.lines.reduce((sum, line) => sum + (line.quantity || 0), 0);
  
  // Calculate volume discount
  const volumeDiscount = calculateVolumeDiscount(totalItems);
  console.log('Volume discount for', totalItems, 'items:', volumeDiscount + '%');

  // Get customer from cart
  const customer = input.cart.buyerIdentity?.customer;
  
  // Initialize discounts array with volume discount if applicable
  const applicableDiscounts = volumeDiscount > 0 ? [volumeDiscount] : [];
  const discountMessages = volumeDiscount > 0 ? [`${volumeDiscount}% volume discount`] : [];
  
  // Process tag-based discounts if customer exists
  if (customer && configuration.tagDiscounts) {
    // Get customer tags that are active
    const customerTags = (customer.hasTags || [])
      .filter(tagInfo => tagInfo.hasTag)
      .map(tagInfo => tagInfo.tag);
    console.log('Customer active tags:', customerTags);

    // Check each customer tag against our configuration
    customerTags.forEach(tag => {
      const tagPercentageKey = `${tag}Percentage`;
      const tagDiscount = configuration.tagDiscounts[tagPercentageKey];
      if (tagDiscount && tagDiscount > 0) {
        applicableDiscounts.push(tagDiscount);
        discountMessages.push(`${tag} (${tagDiscount}%)`);
      }
    });
  }

  // If no discounts found, return empty discount
  if (applicableDiscounts.length === 0) {
    console.log('No valid discounts found');
    return EMPTY_DISCOUNT;
  }

  // Calculate combined discount
  const effectiveDiscount = calculateCombinedDiscount(applicableDiscounts);
  console.log('Effective combined discount:', effectiveDiscount, 'Messages:', discountMessages);

  // Apply discount to all items in cart
  const targets = input.cart.lines
    .filter(line => line.merchandise.__typename === 'ProductVariant')
    .map(line => {
      const variant = /** @type {ProductVariant} */ (line.merchandise);
      return /** @type {Target} */ ({
        productVariant: {
          id: variant.id,
        },
      });
    });

  if (!targets.length) {
    console.log('No valid targets found');
    return EMPTY_DISCOUNT;
  }

  // Calculate remaining items needed for next tier
  let nextTierMessage = '';
  if (volumeDiscount < VOLUME_DISCOUNTS[0].percentage) {
    const nextTier = VOLUME_DISCOUNTS.find(tier => tier.itemCount > totalItems);
    if (nextTier) {
      const itemsNeeded = nextTier.itemCount - totalItems;
      nextTierMessage = ` (Add ${itemsNeeded} more item${itemsNeeded > 1 ? 's' : ''} for ${nextTier.percentage}% off)`;
    }
  }

  console.log('Applying discount to targets:', targets);

  return {
    discounts: [
      {
        targets,
        value: {
          percentage: {
            value: effectiveDiscount.toString(),
          },
        },
        message: `Combined discount: ${discountMessages.join(' + ')}${nextTierMessage}`,
      },
    ],
    discountApplicationStrategy: DiscountApplicationStrategy.All,
  };
}
