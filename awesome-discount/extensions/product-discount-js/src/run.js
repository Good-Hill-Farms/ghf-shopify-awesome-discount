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

// Default Buy X Get Y discount (used only if no configuration is provided)
const DEFAULT_BUY_X_GET_Y = {
  buyQuantity: 2,
  getQuantity: 1,
  discountPercentage: 100, // 100% discount means free item
  enabled: true
};

/**
 * Calculate Buy X Get Y discount for cart items
 * @param {Object} cart The shopping cart
 * @param {Object} buyXGetYConfig The Buy X Get Y configuration
 * @returns {Object} Discount information including targets and percentage
 */
function calculateBuyXGetYDiscount(cart, buyXGetYConfig) {
  // If Buy X Get Y is not enabled, return empty result
  if (!buyXGetYConfig || !buyXGetYConfig.enabled) {
    return { applicable: false };
  }
  
  const { buyQuantity, getQuantity, discountPercentage } = buyXGetYConfig;
  
  // Get all product variants from cart
  const variants = cart.lines
    .filter(line => line.merchandise.__typename === 'ProductVariant')
    .map(line => ({
      id: line.merchandise.id,
      quantity: line.quantity,
      price: parseFloat(line.cost.amountPerQuantity.amount),
      title: line.merchandise.product.title
    }));
  
  // If not enough items in cart, no discount applies
  const totalItems = variants.reduce((sum, variant) => sum + variant.quantity, 0);
  if (totalItems < buyQuantity + getQuantity) {
    return { 
      applicable: false, 
      message: `Add ${buyQuantity + getQuantity - totalItems} more item(s) to qualify for Buy ${buyQuantity} Get ${getQuantity} discount`
    };
  }
  
  // Sort variants by price (lowest first) to maximize customer benefit
  const sortedVariants = [...variants].sort((a, b) => a.price - b.price);
  
  // Determine which items get the discount (the lowest priced ones)
  let remainingDiscountItems = getQuantity;
  const discountTargets = [];
  
  for (const variant of sortedVariants) {
    if (remainingDiscountItems <= 0) break;
    
    const itemsToDiscount = Math.min(variant.quantity, remainingDiscountItems);
    if (itemsToDiscount > 0) {
      discountTargets.push({
        id: variant.id,
        quantity: itemsToDiscount,
        title: variant.title
      });
      remainingDiscountItems -= itemsToDiscount;
    }
  }
  
  return {
    applicable: discountTargets.length > 0,
    targets: discountTargets,
    percentage: discountPercentage,
    message: `Buy ${buyQuantity} Get ${getQuantity} at ${discountPercentage}% off${discountPercentage === 100 ? ' (FREE)' : ''}`
  };
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
    input?.discountNode?.metafield?.value ?? '{"tagDiscounts":{},"buyXGetY":' + JSON.stringify(DEFAULT_BUY_X_GET_Y) + '}'
  );

  console.log('Parsed configuration:', configuration);

  // Calculate total items in cart
  const totalItems = input.cart.lines.reduce((sum, line) => sum + (line.quantity || 0), 0);
  
  // Calculate Buy X Get Y discount
  const buyXGetYResult = calculateBuyXGetYDiscount(input.cart, configuration.buyXGetY);
  console.log('Buy X Get Y discount result:', buyXGetYResult);

  // Get customer from cart
  const customer = input.cart.buyerIdentity?.customer;
  
  // Initialize discounts array with tag discounts only (Buy X Get Y is handled separately)
  const applicableDiscounts = [];
  const discountMessages = [];
  
  // Get message for Buy X Get Y discount if not applicable
  let nextTierMessage = '';
  if (!buyXGetYResult.applicable && buyXGetYResult.message) {
    nextTierMessage = ` (${buyXGetYResult.message})`;
  }
  
  // Process tag-based discounts if customer exists
  if (customer && configuration.tagDiscounts) {
    // Get customer tags that are active
    const customerTags = (customer.hasTags || [])
      .filter(tagInfo => tagInfo && tagInfo.hasTag)
      .map(tagInfo => tagInfo.tag || '');
    console.log('Customer active tags:', customerTags);

    // Check each customer tag against our configuration
    customerTags.forEach(tag => {
      // Skip empty tags
      if (!tag) return;
      
      // Direct lookup by tag name (new format)
      const tagDiscount = configuration.tagDiscounts[tag];
      if (tagDiscount && tagDiscount > 0) {
        applicableDiscounts.push(tagDiscount);
        discountMessages.push(`${tag} (${tagDiscount}%)`);
      }
    });
  }

  // If no tag discounts and Buy X Get Y is not applicable, return empty discount
  if (applicableDiscounts.length === 0 && !buyXGetYResult.applicable) {
    console.log('No valid discounts found');
    return EMPTY_DISCOUNT;
  }

  // Calculate combined discount
  const effectiveDiscount = calculateCombinedDiscount(applicableDiscounts);
  console.log('Effective combined discount:', effectiveDiscount, 'Messages:', discountMessages);

  // Prepare discounts array
  let discounts = [];
  
  // Handle Buy X Get Y discount if applicable
  if (buyXGetYResult.applicable) {
    // Add Buy X Get Y discount targets
    const buyXGetYTargets = buyXGetYResult.targets.map(target => ({
      productVariant: {
        id: target.id,
        quantity: target.quantity
      }
    }));
    
    if (buyXGetYTargets.length > 0) {
      discounts.push({
        targets: buyXGetYTargets,
        value: {
          percentage: {
            value: buyXGetYResult.percentage.toString()
          }
        },
        message: buyXGetYResult.message
      });
    }
  }
  
  // Handle tag-based discounts if applicable
  if (applicableDiscounts.length > 0) {
    // Apply tag-based discounts to all items in cart
    const tagDiscountTargets = input.cart.lines
      .filter(line => line.merchandise.__typename === 'ProductVariant')
      .map(line => {
        const variant = /** @type {ProductVariant} */ (line.merchandise);
        return /** @type {Target} */ ({
          productVariant: {
            id: variant.id,
          },
        });
      });
    
    if (tagDiscountTargets.length > 0) {
      // Calculate combined tag discount
      const effectiveTagDiscount = calculateCombinedDiscount(applicableDiscounts);
      
      discounts.push({
        targets: tagDiscountTargets,
        value: {
          percentage: {
            value: effectiveTagDiscount.toString()
          }
        },
        message: `Tag discounts: ${discountMessages.join(' + ')}${nextTierMessage}`
      });
    }
  }
  
  if (discounts.length === 0) {
    console.log('No valid targets found');
    return EMPTY_DISCOUNT;
  }

  // nextTierMessage is already defined above

  console.log('Applying discounts:', discounts);

  return {
    discounts: discounts,
    discountApplicationStrategy: DiscountApplicationStrategy.All,
  };
}
