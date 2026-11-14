const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { categoryService } = require('../services');
const ApiError = require('../utils/ApiError');

// Create Category

// Get Category by ID
const getCategory = catchAsync(async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }
  res.status(httpStatus.OK).send({
    success: true,
    category,
  });
});
const getSubCategoriesWithImages = catchAsync(async (req, res) => {
  const result = await categoryService.getSubCategoriesWithImages();

  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});
// Get all Categories
const getCategories = catchAsync(async (req, res) => {
  const result = await categoryService.getAllCategories();
  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});
const getAllSubCategories = catchAsync(async (req, res) => {
  const result = await categoryService.getAllSubCategories();

  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});
const getProductsBySubCategory = catchAsync(async (req, res) => {
  const { subCategoryId } = req.params;

  const result = await categoryService.getProductsBySubCategoryId(
    subCategoryId,
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Products fetched successfully',
    ...result,
  });
});

const getProductsBySubCategoryName = catchAsync(async (req, res) => {
  const { categoryId } = req.params;

  // First get the subcategory by name and category
  const subCategory = await categoryService.getSubCategoriesByCategory(
    categoryId,
  );
  if (!subCategory) {
    return res.status(httpStatus.NOT_FOUND).send({
      success: false,
      message: 'Subcategory not found',
    });
  }
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Products fetched successfully',
    ...subCategory,
  });
});

// Delete Category
const deleteCategory = catchAsync(async (req, res) => {
  await categoryService.deleteCategory(req.params.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Category deleted successfully',
  });
});

// SubCategory Controllers

// Create SubCategory
const createCategory = catchAsync(async (req, res) => {
  // Structure files by field name (same as product example)
  const structuredFiles = {};

  if (Array.isArray(req.files)) {
    req.files.forEach((file) => {
      if (!structuredFiles[file.fieldname]) {
        structuredFiles[file.fieldname] = [];
      }
      structuredFiles[file.fieldname].push(file);
    });
  } else if (req.files) {
    for (const [fieldname, files] of Object.entries(req.files)) {
      structuredFiles[fieldname] = Array.isArray(files) ? files : [files];
    }
  }

  // Ensure image field exists even if no file was uploaded
  structuredFiles.image = structuredFiles.image || undefined;

  const category = await categoryService.createCategory(
    req.body,
    structuredFiles,
  );

  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Category created successfully',
    category,
  });
});

// Update Category
const updateCategory = catchAsync(async (req, res) => {
  // Structure files by field name
  const structuredFiles = {};

  if (Array.isArray(req.files)) {
    req.files.forEach((file) => {
      if (!structuredFiles[file.fieldname]) {
        structuredFiles[file.fieldname] = [];
      }
      structuredFiles[file.fieldname].push(file);
    });
  } else if (req.files) {
    for (const [fieldname, files] of Object.entries(req.files)) {
      structuredFiles[fieldname] = Array.isArray(files) ? files : [files];
    }
  }

  // Ensure image field exists even if no file was uploaded
  structuredFiles.image = structuredFiles.image || undefined;

  const category = await categoryService.updateCategory(
    req.params.id,
    req.body,
    structuredFiles,
  );
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Category updated successfully',
    category,
  });
});

const createSubCategory = catchAsync(async (req, res) => {
  // Structure files by field name
  const structuredFiles = {};

  if (Array.isArray(req.files)) {
    req.files.forEach((file) => {
      if (!structuredFiles[file.fieldname]) {
        structuredFiles[file.fieldname] = [];
      }
      structuredFiles[file.fieldname].push(file);
    });
  } else if (req.files) {
    for (const [fieldname, files] of Object.entries(req.files)) {
      structuredFiles[fieldname] = Array.isArray(files) ? files : [files];
    }
  }

  // Ensure image field exists even if no file was uploaded
  structuredFiles.image = structuredFiles.image || undefined;

  const subCategory = await categoryService.createSubCategory(
    req.body,
    structuredFiles,
  );
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'SubCategory created successfully',
    subCategory,
  });
});

// Update SubCategory
const updateSubCategory = catchAsync(async (req, res) => {
  // Structure files by field name
  const structuredFiles = {};

  if (Array.isArray(req.files)) {
    req.files.forEach((file) => {
      if (!structuredFiles[file.fieldname]) {
        structuredFiles[file.fieldname] = [];
      }
      structuredFiles[file.fieldname].push(file);
    });
  } else if (req.files) {
    Object.entries(req.files).forEach(([fieldname, files]) => {
      structuredFiles[fieldname] = Array.isArray(files) ? files : [files];
    });
  }

  // Ensure image field exists even if no file was uploaded
  structuredFiles.image = structuredFiles.image || undefined;

  const subCategory = await categoryService.updateSubCategory(
    req.params.id,
    req.body,
    structuredFiles,
  );
  res.status(httpStatus.OK).send({
    success: true,
    message: 'SubCategory updated successfully',
    subCategory,
  });
});
// Get SubCategory by ID
const getSubCategory = catchAsync(async (req, res) => {
  const subCategory = await categoryService.getSubCategoryById(req.params.id);
  if (!subCategory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'SubCategory not found');
  }
  res.status(httpStatus.OK).send({
    success: true,
    subCategory,
  });
});

// Get SubCategories by Category ID
const getSubCategoriesByCategory = catchAsync(async (req, res) => {
  const result = await categoryService.getSubCategoriesByCategory();
  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});

// Delete SubCategory
const deleteSubCategory = catchAsync(async (req, res) => {
  await categoryService.deleteSubCategory(req.params.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'SubCategory deleted successfully',
  });
});
const getProductsWithImages = catchAsync(async (req, res) => {
  const result = await categoryService.getProductsWithImages();
  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});
const getProducts = catchAsync(async (req, res) => {
  const result = await categoryService.getProducts();
  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});
module.exports = {
  createCategory,
  getCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  createSubCategory,
  getSubCategory,
  getSubCategoriesByCategory,
  updateSubCategory,
  deleteSubCategory,
  getProductsBySubCategory,
  getProductsBySubCategoryName,
  getAllSubCategories,
  getSubCategoriesWithImages,
  getProductsWithImages,
  getProducts,
};
