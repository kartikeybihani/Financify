const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("investments navigation refactor", () => {
  it("adds Investments to the bottom tab layout", () => {
    const tabsLayout = read("app/(tabs)/_layout.tsx");

    expect(tabsLayout).toContain('name: "investments"');
    expect(tabsLayout).toContain('label: "Investments"');
    expect(tabsLayout).toContain('<NativeTabs.Trigger name="investments">');
  });

  it("removes Investments from Insights sections", () => {
    const insightsScreen = read("app/(tabs)/insights/index.tsx");

    expect(insightsScreen).not.toContain('{ key: "investments", label: "Investments" }');
    expect(insightsScreen).not.toContain("InvestmentsPage");
  });

  it("routes legacy investments notification targets to the Investments tab", () => {
    const notificationService = read("src/utils/core/notificationService.ts");

    expect(notificationService).toContain("case 'insights_investments':");
    expect(notificationService).toContain("router.push('/(tabs)/investments');");
  });

  it("uses a shared Investments screen from the new tab route", () => {
    const investmentsTab = read("app/(tabs)/investments.tsx");
    const sharedScreen = read("src/screens/InvestmentsScreen.tsx");
    const header = read("src/components/investments/CleanInvestmentsHeader.tsx");

    expect(investmentsTab).toContain('import InvestmentsScreen from "@/src/screens/InvestmentsScreen";');
    expect(sharedScreen).toContain('import CleanInvestmentsHeader from "@/src/components/investments/CleanInvestmentsHeader";');
    expect(sharedScreen).toContain("<CleanInvestmentsHeader");
    expect(sharedScreen).toContain("loadInvestmentFromCacheSync");
    expect(sharedScreen).toContain("saveInvestmentToCache");
    expect(header).toContain("Investments");
  });
});
