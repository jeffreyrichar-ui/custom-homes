import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AdminImport } from "./pages/AdminImport.js";
import { ProjectsList } from "./pages/ProjectsList.js";
import { ProjectDetail } from "./pages/ProjectDetail.js";

export function App() {
  return (
    <>
      <nav>
        <strong>Custom Homes</strong>
        <Link to="/projects">Projects</Link>
        <Link to="/admin/import">Admin Import</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsList />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/admin/import" element={<AdminImport />} />
          <Route path="*" element={<p>Not found</p>} />
        </Routes>
      </main>
    </>
  );
}
