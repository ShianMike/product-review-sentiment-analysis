import os
import tempfile
import time
import unittest

from backend._13_storage import (
    cleanup_folder,
    delete_analysis_project,
    list_analysis_projects,
    load_analysis_project,
    save_analysis_project,
    validate_project_id,
)


class StorageTests(unittest.TestCase):
    def test_save_list_load_and_delete_project(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            result = {
                'filename': 'reviews.csv',
                'total_reviews': 3,
                'sentiment_distribution': {
                    'positive': {'percentage': 66.7},
                    'neutral': {'percentage': 0},
                    'negative': {'percentage': 33.3},
                },
            }

            saved = save_analysis_project(tmpdir, result, title='Demo Reviews')
            projects = list_analysis_projects(tmpdir)
            loaded = load_analysis_project(tmpdir, saved['id'])

            self.assertEqual(len(projects), 1)
            self.assertEqual(projects[0]['title'], 'Demo Reviews')
            self.assertEqual(loaded['result']['filename'], 'reviews.csv')
            self.assertEqual(loaded['result']['project_id'], saved['id'])
            self.assertTrue(delete_analysis_project(tmpdir, saved['id']))
            self.assertEqual(list_analysis_projects(tmpdir), [])

    def test_validate_project_id_rejects_path_traversal(self):
        with self.assertRaises(ValueError):
            validate_project_id('../secret')

    def test_cleanup_folder_respects_prefix_filter(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            generated = os.path.join(tmpdir, 'processed_old.csv')
            protected = os.path.join(tmpdir, 'model_comparison_full_training_data.json')
            with open(generated, 'w', encoding='utf-8') as file_obj:
                file_obj.write('old')
            with open(protected, 'w', encoding='utf-8') as file_obj:
                file_obj.write('keep')
            old_time = time.time() - 10 * 3600
            os.utime(generated, (old_time, old_time))
            os.utime(protected, (old_time, old_time))

            result = cleanup_folder(
                tmpdir,
                max_files=10,
                max_age_hours=1,
                suffixes=('.csv', '.json'),
                prefixes=('processed_',),
            )

            self.assertEqual(result['deleted'], 1)
            self.assertFalse(os.path.exists(generated))
            self.assertTrue(os.path.exists(protected))


if __name__ == '__main__':
    unittest.main()
