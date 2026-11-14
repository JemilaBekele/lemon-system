/* eslint-disable no-restricted-syntax */
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { productService } = require('../services');
const {
  syncPricesToEcommerce,
} = require('../services/ecommercePriceSync.service');
const ApiError = require('../utils/ApiError');
const prisma = require('../services/prisma');
const { getAccessibleLocations } = require('../utils/accessibleLocations');

// Create Product
const createProduct = catchAsync(async (req, res) => {
  console.log('=== CREATE PRODUCT REQUEST START ===');
  console.log('Request body keys:', Object.keys(req.body || {}));

  // Check what type subProducts is
  console.log('subProducts type:', typeof req.body.subProducts);
  console.log(
    'subProducts value:',
    JSON.stringify(req.body.subProducts, null, 2),
  );

  console.log('Request files:', req.files ? 'Files present' : 'No files');

  // Structure files by field name
  const structuredFiles = {};

  // Handle file uploads from FormData
  if (Array.isArray(req.files)) {
    // Case: req.files is an array
    console.log('Files are in array format');
    req.files.forEach((file) => {
      if (!structuredFiles[file.fieldname]) {
        structuredFiles[file.fieldname] = [];
      }
      structuredFiles[file.fieldname].push(file);
      console.log(
        `File: ${file.fieldname} - ${file.originalname} - size: ${file.size} bytes`,
      );
    });
  } else if (req.files) {
    // Case: req.files is an object (multer's default)
    console.log('Files are in object format');
    console.log('All file fields:', Object.keys(req.files));

    for (const [fieldname, files] of Object.entries(req.files)) {
      structuredFiles[fieldname] = Array.isArray(files) ? files : [files];
      console.log(
        `File field: ${fieldname} - count: ${structuredFiles[fieldname].length}`,
      );

      // Log each file in this field
      structuredFiles[fieldname].forEach((file, index) => {
        console.log(
          `  File ${index}: ${file.originalname} - ${file.size} bytes - mimetype: ${file.mimetype}`,
        );
      });
    }
  }

  // Ensure main product image field exists even if no file was uploaded
  structuredFiles.image = structuredFiles.image || undefined;
  console.log(
    'Main image file:',
    structuredFiles.image ? 'Present' : 'Not present',
  );

  // Check for missing sellPrice (this could cause validation error)
  if (!req.body.sellPrice) {
    console.log('WARNING: sellPrice is missing from request body!');
    // Set a default value if null/undefined
    req.body.sellPrice = req.body.sellPrice || 0;
  }

  // Log structured files for debugging
  console.log('Structured files keys:', Object.keys(structuredFiles));
  console.log('Structured files details:');
  Object.keys(structuredFiles).forEach((key) => {
    const fileOrArray = structuredFiles[key];
    if (Array.isArray(fileOrArray)) {
      console.log(`  ${key}: Array with ${fileOrArray.length} files`);
      fileOrArray.forEach((file, idx) => {
        if (file && file.originalname) {
          console.log(`    [${idx}] ${file.originalname}`);
        }
      });
    } else if (fileOrArray && fileOrArray.originalname) {
      console.log(`  ${key}: Single file - ${fileOrArray.originalname}`);
    } else {
      console.log(`  ${key}: ${fileOrArray}`);
    }
  });

  console.log('=== CREATE PRODUCT REQUEST END ===');

  try {
    console.log('Calling productService.createProduct...');

    // IMPORTANT: Pass only the body and files, not the entire request object
    const product = await productService.createProduct(
      req.body,
      structuredFiles,
    );
    console.log('Product service call successful');

    res.status(httpStatus.CREATED).send({
      success: true,
      message: 'Product created successfully',
      product,
    });
  } catch (error) {
    console.error('Error in createProduct controller:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
});

const createProductBatch = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const batchData = req.body;
  const userId = req.user.id; // Assuming user is attached to request during authentication

  const productBatch = await productService.createProductBatch(
    productId,
    batchData,
    userId,
  );

  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Product batch created successfully',
    productBatch,
  });
});
// Update Product
const updateProduct = catchAsync(async (req, res) => {
  console.log('=== UPDATE PRODUCT REQUEST START ===');
  console.log('Product ID to update:', req.params.id);
  console.log('Request body keys:', Object.keys(req.body || {}));
  console.log('subProducts type:', typeof req.body.subProducts);
  console.log(
    'subProducts value:',
    JSON.stringify(req.body.subProducts, null, 2),
  );

  console.log('Request files:', req.files ? 'Files present' : 'No files');

  // Structure files by field name
  const structuredFiles = {};

  // Handle file uploads from FormData
  if (Array.isArray(req.files)) {
    // Case: req.files is an array
    console.log('Files are in array format');
    req.files.forEach((file) => {
      if (!structuredFiles[file.fieldname]) {
        structuredFiles[file.fieldname] = [];
      }
      structuredFiles[file.fieldname].push(file);
      console.log(
        `File: ${file.fieldname} - ${file.originalname} - size: ${file.size} bytes`,
      );
    });
  } else if (req.files) {
    // Case: req.files is an object (multer's default)
    console.log('Files are in object format');
    console.log('All file fields:', Object.keys(req.files));

    for (const [fieldname, files] of Object.entries(req.files)) {
      structuredFiles[fieldname] = Array.isArray(files) ? files : [files];
      console.log(
        `File field: ${fieldname} - count: ${structuredFiles[fieldname].length}`,
      );

      // Log each file in this field
      structuredFiles[fieldname].forEach((file, index) => {
        console.log(
          `  File ${index}: ${file.originalname} - ${file.size} bytes - mimetype: ${file.mimetype}`,
        );
      });
    }
  }

  // Ensure main product image field exists even if no file was uploaded
  structuredFiles.image = structuredFiles.image || undefined;
  console.log(
    'Main image file:',
    structuredFiles.image ? 'Present' : 'Not present',
  );

  // Check for subproduct images
  Object.keys(structuredFiles).forEach((key) => {
    if (key.startsWith('subproduct_image_')) {
      console.log(`Found subproduct image key: ${key}`);
    }
  });

  // Log structured files for debugging
  console.log('Structured files keys:', Object.keys(structuredFiles));
  console.log('Structured files details:');
  Object.keys(structuredFiles).forEach((key) => {
    const fileOrArray = structuredFiles[key];
    if (Array.isArray(fileOrArray)) {
      console.log(`  ${key}: Array with ${fileOrArray.length} files`);
      fileOrArray.forEach((file, idx) => {
        if (file && file.originalname) {
          console.log(`    [${idx}] ${file.originalname}`);
        }
      });
    } else if (fileOrArray && fileOrArray.originalname) {
      console.log(`  ${key}: Single file - ${fileOrArray.originalname}`);
    } else {
      console.log(`  ${key}: ${fileOrArray}`);
    }
  });

  console.log('=== UPDATE PRODUCT REQUEST END ===');

  try {
    console.log('Calling productService.updateProduct...');

    const product = await productService.updateProduct(
      req.params.id,
      req.body,
      structuredFiles,
    );

    console.log('Product service call successful');
    console.log('Updated product ID:', product.id);

    res.status(httpStatus.OK).send({
      success: true,
      message: 'Product updated successfully',
      product,
    });
  } catch (error) {
    console.error('Error in updateProduct controller:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
});
// Get Product by ID
const getProduct = catchAsync(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }
  res.status(httpStatus.OK).send({
    success: true,
    product,
  });
});
const getSubProductsByProductId = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const subProducts = await productService.getSubProductsByProductId(productId);
  if (!subProducts) {
    throw new ApiError(httpStatus.NOT_FOUND, 'SubProducts not found');
  }
  res.status(httpStatus.OK).send({
    success: true,
    subProducts,
  });
});

const getBatchesByProduct = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const { subProductId } = req.query;

  const result = await productService.getBatchesByProduct(
    productId,
    subProductId,
  );

  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});

// Get Product by Code
const getProductByCode = catchAsync(async (req, res) => {
  const product = await productService.getProductByCode(req.params.code);
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }
  res.status(httpStatus.OK).send({
    success: true,
    product,
  });
});

// Get all Products
const getActiveAllProducts = catchAsync(async (req, res) => {
  const result = await productService.getActiveAllProducts();
  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});
//
const getAllSubProducts = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const result = await productService.getAllSubProducts(userId);
  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});
const getProducts = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const result = await productService.getAllProducts(userId);
  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});
const getTopSellingProducts = catchAsync(async (req, res) => {
  const { searchTerm, categoryName, subCategoryName } = req.query;
  const userId = req.user.id;

  // Convert empty strings to null and ensure proper parameter assignment
  const processedSearchTerm =
    searchTerm && searchTerm.trim() !== '' ? searchTerm.trim() : null;
  const processedCategoryName =
    categoryName && categoryName.trim() !== '' ? categoryName.trim() : null;
  const processedSubCategoryName =
    subCategoryName && subCategoryName.trim() !== ''
      ? subCategoryName.trim()
      : null;

  // DEBUG: Check if parameters are being mixed up
  if (processedSearchTerm && isValidUUID(processedSearchTerm)) {
    console.warn(
      '⚠️ WARNING: searchTerm looks like a UUID, might be parameter mixup',
    );
  }

  // DEBUG: Check if category/subcategory names look like UUIDs
  if (processedCategoryName && isValidUUID(processedCategoryName)) {
    console.warn(
      '⚠️ WARNING: categoryName looks like a UUID, did you mean to use the name?',
    );
  }

  if (processedSubCategoryName && isValidUUID(processedSubCategoryName)) {
    console.warn(
      '⚠️ WARNING: subCategoryName looks like a UUID, did you mean to use the name?',
    );
  }

  const result = await productService.getTopSellingProducts(
    userId,
    processedSearchTerm, // This should be the text search
    processedCategoryName, // This should be the category name
    processedSubCategoryName, // This should be the subcategory name
  );

  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});

// Helper function to check if string is a valid UUID
function isValidUUID(str) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}
const getRandomProductsWithShopStocks = catchAsync(async (req, res) => {
  const result = await productService.getRandomProductsWithShopStocks();

  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});
// Delete Product
const deleteProduct = catchAsync(async (req, res) => {
  await productService.deleteProduct(req.params.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Product deleted successfully',
  });
});
const createProductBatchsingle = catchAsync(async (req, res) => {
  const productBatch = await productService.createProductBatchsingle(req.body);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Product batch created successfully',
    data: productBatch,
  });
});
const getProductById = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const userId = req.user.id;
  const productDetails = await productService.getProductDetails(
    productId,
    userId,
  );

  if (!productDetails) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }

  res.status(httpStatus.OK).send({ product: productDetails });
});
const getSubProductDetails = catchAsync(async (req, res) => {
  const details = await productService.getSubProductDetails(
    req.params.subProductId,
    req.user.id,
  );
  res.status(httpStatus.OK).send(details);
});
const getProductBatchesByShopsController = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const { subProductId } = req.query; // 👈 get subProductId from query

  const batches = await productService.getProductBatchesByShops(
    productId,
    subProductId || null, // 👈 pass to service
  );

  if (!batches) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No available batches found for this product',
    );
  }

  res.status(httpStatus.OK).send({ batches });
});

// getProductBatchesByShopsForUser
const getProductBatchesByShopsForUser = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const { subProductId } = req.query;
  const userId = req.user.id;

  // A variant (sub-product): stock and prices for that variant in the user's shops
  if (subProductId) {
    const locations = await getAccessibleLocations(userId);
    if (!locations) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    const batches = await productService.getProductBatchesByShops(
      productId,
      subProductId,
      locations.shopIds,
    );
    res.status(httpStatus.OK).send({ batches });
    return;
  }

  const [batches, subProducts] = await Promise.all([
    productService.getProductBatchesByShopsForUser(productId, userId),
    prisma.subProduct.findMany({
      where: { productId, isActive: true },
      select: {
        id: true,
        name: true,
        subProductCode: true,
        imageUrl: true,
        sellPrice: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!batches || batches.length === 0) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No available batches found for this product',
    );
  }

  // subProducts lets the app ask the salesperson to pick a variant first
  res.status(httpStatus.OK).send({ batches, subProducts });
});
const getAvailableProductsWithQuantities = catchAsync(async (req, res) => {
  const data = await productService.getAvailableProductsWithQuantities();

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Available products fetched successfully',
    ...data, // items + totalItems
  });
});
const getcodeAvailableProductsWithQuantities = catchAsync(async (req, res) => {
  const { productCode, subProductCode } = req.query;
  console.log('Received query parameters:', { productCode, subProductCode });
  const data = await productService.getcodeAvailableProductsWithQuantities(
    productCode,
    subProductCode,
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Available products fetched successfully',
    ...data, // items + totalItems
  });
});
// Price Update page. Body: { changes: [{ kind, id, oldPrice, newPrice }] }
const updatePrices = catchAsync(async (req, res) => {
  const result = await productService.updatePrices(
    req.body && req.body.changes,
    req.user.id,
  );
  res.status(httpStatus.OK).send({
    success: true,
    message: `${result.updated} price(s) updated`,
    data: result,
  });
});

// Price Update page: push the e-commerce prices to the e-commerce system
const syncEcommercePrices = catchAsync(async (req, res) => {
  const result = await syncPricesToEcommerce();
  const updated =
    ((result.products && result.products.updated) || 0) +
    ((result.subProducts && result.subProducts.updated) || 0);
  res.status(httpStatus.OK).send({
    success: true,
    message: `${updated} e-commerce price(s) updated online`,
    data: result,
  });
});

module.exports = {
  updatePrices,
  syncEcommercePrices,
  getSubProductDetails,
  getcodeAvailableProductsWithQuantities,
  getAvailableProductsWithQuantities,
  createProductBatch,
  createProduct,
  getProduct,
  getProductByCode,
  getProducts,
  updateProduct,
  deleteProduct,
  getBatchesByProduct,
  createProductBatchsingle,
  getProductById,
  getSubProductsByProductId,
  getProductBatchesByShopsController,
  getTopSellingProducts,
  getActiveAllProducts,
  getRandomProductsWithShopStocks,
  getProductBatchesByShopsForUser,
  getAllSubProducts,
};
