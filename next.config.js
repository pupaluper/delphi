module.exports = {
  basePath:
    process.env.NEXT_PUBLIC_REPOSITORY_NAME &&
    `/${process.env.NEXT_PUBLIC_REPOSITORY_NAME}`,
  assetPrefix:
    process.env.NEXT_PUBLIC_REPOSITORY_NAME &&
    `/${process.env.NEXT_PUBLIC_REPOSITORY_NAME}`,
};
