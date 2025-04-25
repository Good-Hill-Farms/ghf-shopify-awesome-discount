/**
 * Shopify Customer Tags to Infoplus Order Tags Sync Script
 * Script Type: Record
 * Record Type: Order
 * 
 * This script syncs customer tags from Shopify to Infoplus orders.
 * It only runs on orders that originated from Shopify.
 */

// Configuration validation
if (!process.env.SHOPIFY_ACCESS_TOKEN || !process.env.SHOPIFY_SUBDOMAIN) {
    throw new Error("SHOPIFY_ACCESS_TOKEN and SHOPIFY_SUBDOMAIN environment variables must be set");
}

// Constants
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_SUBDOMAIN = process.env.SHOPIFY_SUBDOMAIN;
const SHOPIFY_API_VERSION = '2024-01'; // Using latest stable API version

// GraphQL query to get customer tags
const GET_CUSTOMER_TAGS = `
  query GetCustomerTags($customerId: ID!) {
    customer(id: $customerId) {
      id
      hasTags(tags: []) {
        tag
        hasTag
      }
    }
  }
`;

/**
 * Main function to process the order
 * @param {Object} order - The Infoplus order object
 */
function processOrder(order) {
    // Check if this is a Shopify order
    const customerId = getOrderExtraData(order, "SHOP-CUSTOMER.ID");
    
    if (!customerId) {
        utils.log("Not a Shopify order (no customer ID found) - skipping processing");
        return;
    }

    try {
        // Ensure the customer ID is in the proper Shopify GraphQL format
        const formattedCustomerId = customerId.includes('gid://') 
            ? customerId 
            : `gid://shopify/Customer/${customerId}`;

        // Fetch customer data from Shopify
        const customerData = fetchShopifyCustomer(formattedCustomerId);
        
        if (!customerData?.data?.customer) {
            utils.log("No customer data found in Shopify response");
            return;
        }

        // Process customer tags
        processCustomerTags(order, customerData.data.customer);

    } catch (error) {
        utils.log("Error processing order: " + error.message);
        utils.log("Stack trace: " + error.stack);
    }
}

/**
 * Fetches customer data from Shopify using GraphQL
 * @param {string} customerId - Shopify customer ID (GraphQL format)
 * @returns {Object} Customer data from Shopify
 */
function fetchShopifyCustomer(customerId) {
    const url = `https://${SHOPIFY_SUBDOMAIN}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    
    const response = utils.httpRequest({
        method: "POST",
        headers: [
            "X-Shopify-Access-Token: " + SHOPIFY_ACCESS_TOKEN,
            "Content-Type: application/json"
        ],
        url: url,
        body: JSON.stringify({
            query: GET_CUSTOMER_TAGS,
            variables: { customerId }
        })
    });

    if (response.statusCode !== 200) {
        throw new Error(`Shopify GraphQL request failed with status ${response.statusCode}: ${response.body}`);
    }

    try {
        return utils.stringToJson(response.body);
    } catch (error) {
        throw new Error("Failed to parse Shopify GraphQL response: " + error.message);
    }
}

/**
 * Process customer tags and add them to the Infoplus order
 * @param {Object} order - The Infoplus order object
 * @param {Object} customerData - Customer data from Shopify GraphQL API
 */
function processCustomerTags(order, customerData) {
    if (!customerData.hasTags || !Array.isArray(customerData.hasTags)) {
        utils.log("No tags found for customer");
        return;
    }

    const tags = customerData.hasTags
        .filter(tagInfo => tagInfo.hasTag)
        .map(tagInfo => tagInfo.tag);
    
    utils.log(`Processing ${tags.length} tags for customer`);

    // Add each tag to the order
    tags.forEach(tag => {
        try {
            infoplusApi.addTag("order", order.orderNo, tag);
            utils.log(`Successfully added tag: ${tag}`);
        } catch (error) {
            utils.log(`Failed to add tag ${tag}: ${error.message}`);
        }
    });
}

/**
 * Helper function to get order extra data
 * @param {Object} order - The Infoplus order object
 * @param {string} code - The extra data code to look for
 * @returns {string|null} The extra data value or null if not found
 */
function getOrderExtraData(order, code) {
    const extraDataList = order.extraOrderData;
    if (!extraDataList) return null;

    for (let i = 0; i < extraDataList.size(); i++) {
        const extraData = extraDataList.get(i);
        if (extraData.code === code) {
            return extraData.value;
        }
    }
    return null;
}

// Execute the script
try {
    processOrder(order);
} catch (error) {
    utils.log("Critical error in script execution: " + error.message);
    utils.log("Stack trace: " + error.stack);
    throw error; // Re-throw critical errors
} 